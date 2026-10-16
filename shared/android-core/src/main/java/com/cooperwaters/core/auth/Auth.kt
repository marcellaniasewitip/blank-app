package com.cooperwaters.core.auth

import com.cooperwaters.core.net.AuthUser
import com.cooperwaters.core.net.TokenPair
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * Where the session lives. The Android implementation ([com.cooperwaters.core.android.EncryptedTokenStore])
 * keeps it in EncryptedSharedPreferences. Methods are synchronous because OkHttp interceptors are.
 */
interface TokenStore {
    fun accessToken(): String?
    fun refreshToken(): String?
    fun user(): AuthUser?
    fun saveTokens(pair: TokenPair)
    fun saveUser(user: AuthUser)
    fun clear()
}

class InMemoryTokenStore(
    private var access: String? = null,
    private var refresh: String? = null,
    private var authUser: AuthUser? = null,
) : TokenStore {
    @Synchronized override fun accessToken() = access
    @Synchronized override fun refreshToken() = refresh
    @Synchronized override fun user() = authUser
    @Synchronized override fun saveTokens(pair: TokenPair) {
        access = pair.accessToken
        refresh = pair.refreshToken
    }
    @Synchronized override fun saveUser(user: AuthUser) {
        authUser = user
    }
    @Synchronized override fun clear() {
        access = null
        refresh = null
        authUser = null
    }
}

/** Result of calling POST /auth/refresh. */
sealed interface RefreshOutcome {
    data class Refreshed(val pair: TokenPair) : RefreshOutcome
    /** The server rejected the refresh token (401/403: revoked, reused or expired) — the session is over. */
    data object Rejected : RefreshOutcome
    /** No answer (offline, 5xx). Keep the tokens; the caller fails this request and can retry later. */
    data object Unavailable : RefreshOutcome
}

/**
 * Single-flight access-token refresh.
 *
 * Refresh tokens ROTATE on the backend and reusing an old one revokes the session, so concurrent 401s
 * must never trigger two refresh calls. All callers serialise on [mutex]; whoever comes second sees that
 * the stored access token already differs from the one that failed and simply reuses it.
 */
class TokenRefresher(
    private val store: TokenStore,
    private val refreshCall: suspend (refreshToken: String) -> RefreshOutcome,
    private val onSessionExpired: () -> Unit = {},
) {
    private val mutex = Mutex()

    /**
     * @param failedAccessToken the access token that just got a 401 (null if the request had none).
     * @return a fresh access token to retry with, or null when the request should fail.
     */
    suspend fun refresh(failedAccessToken: String?): String? = mutex.withLock {
        val current = store.accessToken()
        if (current != null && current != failedAccessToken) return@withLock current
        val refreshToken = store.refreshToken()
        if (refreshToken == null) {
            if (failedAccessToken != null) onSessionExpired()
            return@withLock null
        }
        when (val outcome = refreshCall(refreshToken)) {
            is RefreshOutcome.Refreshed -> {
                store.saveTokens(outcome.pair)
                outcome.pair.accessToken
            }
            RefreshOutcome.Rejected -> {
                store.clear()
                onSessionExpired()
                null
            }
            RefreshOutcome.Unavailable -> null
        }
    }
}

/** Adds `Authorization: Bearer <access>` to every request except the public auth endpoints. */
class AuthInterceptor(private val store: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (req.header(NO_AUTH_HEADER) != null) {
            return chain.proceed(req.newBuilder().removeHeader(NO_AUTH_HEADER).build())
        }
        val token = store.accessToken()
        val authed = if (token != null && req.header("Authorization") == null) {
            req.newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            req
        }
        return chain.proceed(authed)
    }

    companion object {
        const val NO_AUTH_HEADER = "X-CW-No-Auth"
    }
}

/** OkHttp [Authenticator]: on 401, refresh once (single-flight) and retry the request with the new token. */
class TokenAuthenticator(private val refresher: TokenRefresher) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (priorResponses(response) >= 2) return null
        val failed = response.request.header("Authorization")?.removePrefix("Bearer ")?.trim()
        val fresh = runBlocking { refresher.refresh(failed) } ?: return null
        if (fresh == failed) return null
        return response.request.newBuilder().header("Authorization", "Bearer $fresh").build()
    }

    private fun priorResponses(response: Response): Int {
        var count = 1
        var r = response.priorResponse
        while (r != null) {
            count++
            r = r.priorResponse
        }
        return count
    }
}
