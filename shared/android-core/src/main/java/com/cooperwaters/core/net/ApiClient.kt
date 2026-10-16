package com.cooperwaters.core.net

import com.cooperwaters.core.auth.AuthInterceptor
import com.cooperwaters.core.auth.RefreshOutcome
import com.cooperwaters.core.auth.TokenAuthenticator
import com.cooperwaters.core.auth.TokenRefresher
import com.cooperwaters.core.auth.TokenStore
import com.cooperwaters.core.util.CrashReporter
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.ResponseBody
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

/** JSON settings shared by REST, realtime and the on-device caches. */
val CwJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
    encodeDefaults = true
}

data class ApiConfig(
    /** e.g. http://10.0.2.2:3100 (no trailing /api/v1). */
    val baseUrl: String,
    val userAgent: String,
    val debugLogging: Boolean = false,
)

/**
 * Builds the OkHttp/Retrofit stack:
 *  - [AuthInterceptor] adds the bearer token;
 *  - [TokenAuthenticator] refreshes on 401 — single-flight, because refresh tokens rotate;
 *  - [GetRetryInterceptor] retries idempotent GETs on flaky networks (mutations go through
 *    [com.cooperwaters.core.queue.IdempotentRequestQueue] with an Idempotency-Key instead).
 */
class ApiClient(
    val config: ApiConfig,
    val tokenStore: TokenStore,
    private val crashReporter: CrashReporter = CrashReporter.NoOp,
    onSessionExpired: () -> Unit = {},
) {
    val json: Json = CwJson
    val apiRoot: String = config.baseUrl.trimEnd('/') + "/api/v1/"

    private val userAgent = Interceptor { chain ->
        chain.proceed(chain.request().newBuilder().header("User-Agent", config.userAgent).build())
    }

    private fun baseBuilder(): OkHttpClient.Builder = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .addInterceptor(userAgent)
        .apply {
            if (config.debugLogging) {
                addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            }
        }

    /** No auth, no authenticator: used for the auth endpoints and pre-signed upload URLs. */
    val plainHttp: OkHttpClient = baseBuilder().build()

    private val plainRetrofit: Retrofit = Retrofit.Builder()
        .baseUrl(apiRoot)
        .client(plainHttp)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    val authApi: AuthApi = plainRetrofit.create(AuthApi::class.java)

    val tokenRefresher = TokenRefresher(
        store = tokenStore,
        refreshCall = { rt -> refreshViaApi(rt) },
        onSessionExpired = onSessionExpired,
    )

    val http: OkHttpClient = baseBuilder()
        .addInterceptor(AuthInterceptor(tokenStore))
        .addInterceptor(GetRetryInterceptor())
        .authenticator(TokenAuthenticator(tokenRefresher))
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(apiRoot)
        .client(http)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    fun <T> create(service: Class<T>): T = retrofit.create(service)

    val customerApi: CustomerApi by lazy { create(CustomerApi::class.java) }
    val driverApi: DriverApi by lazy { create(DriverApi::class.java) }

    /** Socket.IO namespace URL. */
    val realtimeUrl: String = config.baseUrl.trimEnd('/') + "/realtime"

    private suspend fun refreshViaApi(refreshToken: String): RefreshOutcome = try {
        RefreshOutcome.Refreshed(authApi.refresh(RefreshRequest(refreshToken)))
    } catch (e: CancellationException) {
        throw e
    } catch (e: HttpException) {
        if (e.code() == 401 || e.code() == 403) RefreshOutcome.Rejected else RefreshOutcome.Unavailable
    } catch (e: IOException) {
        RefreshOutcome.Unavailable
    } catch (e: Exception) {
        crashReporter.recordException(e, mapOf("where" to "token_refresh"))
        RefreshOutcome.Unavailable
    }
}

/**
 * Retries GET requests (safe to repeat) on IOException with a short backoff.
 * POST/PUT/PATCH/DELETE are never retried here.
 */
class GetRetryInterceptor(
    private val policy: RetryPolicy = RetryPolicy(maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 4_000),
    private val sleeper: (Long) -> Unit = { Thread.sleep(it) },
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (req.method != "GET") return chain.proceed(req)
        var attempt = 0
        while (true) {
            try {
                val resp = chain.proceed(req)
                if (resp.code in 502..504 && attempt < policy.maxAttempts - 1) {
                    resp.close()
                } else {
                    return resp
                }
            } catch (e: IOException) {
                if (attempt >= policy.maxAttempts - 1 || chain.call().isCanceled()) throw e
            }
            sleeper(policy.delayForAttempt(attempt))
            attempt++
        }
    }
}

/** Decode a body that may be JSON `null` or empty (e.g. GET /driver/orders/active with no job). */
fun <T> decodeNullable(json: Json, serializer: KSerializer<T>, body: ResponseBody?): T? {
    val text = body?.use { it.string() }?.trim().orEmpty()
    if (text.isEmpty() || text == "null" || text == "{}") return null
    return json.decodeFromString(serializer, text)
}

/** Call an endpoint returning `Response<ResponseBody>` whose body may be null, and decode it. */
suspend fun <T> nullableApiCall(
    json: Json,
    serializer: KSerializer<T>,
    block: suspend () -> retrofit2.Response<ResponseBody>,
): ApiResult<T?> = when (val r = apiResponse(block)) {
    is ApiResult.Failure -> r
    is ApiResult.Success -> try {
        ApiResult.Success(decodeNullable(json, serializer, r.value))
    } catch (e: Exception) {
        ApiResult.Failure(ErrorParser.fromThrowable(e))
    }
}
