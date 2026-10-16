package com.cooperwaters.core

import com.cooperwaters.core.auth.InMemoryTokenStore
import com.cooperwaters.core.auth.RefreshOutcome
import com.cooperwaters.core.auth.TokenRefresher
import com.cooperwaters.core.net.ApiClient
import com.cooperwaters.core.net.ApiConfig
import com.cooperwaters.core.net.TokenPair
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class TokenRefreshTest {
    private val server = MockWebServer()

    @After fun tearDown() = server.shutdown()

    @Test fun concurrentRefreshesMakeOneCall() = runTest {
        val store = InMemoryTokenStore("old-access", "old-refresh")
        val calls = AtomicInteger()
        val refresher = TokenRefresher(store, refreshCall = { rt ->
            calls.incrementAndGet()
            assertEquals("old-refresh", rt)
            delay(100)
            RefreshOutcome.Refreshed(TokenPair("new-access", "new-refresh", 900))
        })
        val results = (1..20).map { async { refresher.refresh("old-access") } }.awaitAll()
        assertEquals(1, calls.get())
        assertTrue(results.all { it == "new-access" })
        assertEquals("new-refresh", store.refreshToken())
    }

    @Test fun rejectedRefreshClearsSessionOnce() = runTest {
        val store = InMemoryTokenStore("a", "r")
        var expired = 0
        val refresher = TokenRefresher(store, refreshCall = { RefreshOutcome.Rejected }, onSessionExpired = { expired++ })
        assertNull(refresher.refresh("a"))
        assertNull(store.accessToken())
        assertNull(store.refreshToken())
        assertEquals(1, expired)
    }

    @Test fun offlineRefreshKeepsTokens() = runTest {
        val store = InMemoryTokenStore("a", "r")
        val refresher = TokenRefresher(store, refreshCall = { RefreshOutcome.Unavailable })
        assertNull(refresher.refresh("a"))
        assertEquals("r", store.refreshToken())
    }

    /** End to end through OkHttp: parallel 401s → exactly one POST /auth/refresh, all requests retried with the new token. */
    @Test fun authenticatorIsSingleFlightOverHttp() = runBlocking {
        val refreshCalls = AtomicInteger()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path ?: ""
                return when {
                    path.endsWith("/auth/refresh") -> {
                        refreshCalls.incrementAndGet()
                        Thread.sleep(200)
                        if (request.body.readUtf8().contains("old-refresh")) {
                            MockResponse().setBody("""{"accessToken":"new-access","refreshToken":"new-refresh","expiresIn":900}""")
                        } else {
                            MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"Refresh token reused"}}""")
                        }
                    }
                    request.getHeader("Authorization") == "Bearer new-access" ->
                        MockResponse().setBody("""{"id":"c1","phone":"+67571000001","name":"Mary"}""")
                    else -> MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"Authentication required"}}""")
                }
            }
        }
        server.start()
        val store = InMemoryTokenStore("old-access", "old-refresh")
        var expired = false
        val client = ApiClient(ApiConfig(server.url("/").toString().trimEnd('/'), "test"), store, onSessionExpired = { expired = true })
        val names = withContext(Dispatchers.IO) {
            (1..6).map { async { client.customerApi.me().name } }.awaitAll()
        }
        assertEquals(List(6) { "Mary" }, names)
        assertEquals(1, refreshCalls.get())
        assertEquals("new-refresh", store.refreshToken())
        assertTrue(!expired)
    }
}
