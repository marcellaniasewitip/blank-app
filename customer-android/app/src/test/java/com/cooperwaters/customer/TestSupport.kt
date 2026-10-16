package com.cooperwaters.customer

import com.cooperwaters.core.auth.InMemoryTokenStore
import com.cooperwaters.core.cache.JsonCache
import com.cooperwaters.core.net.ApiClient
import com.cooperwaters.core.net.ApiConfig
import com.cooperwaters.core.net.RetryPolicy
import com.cooperwaters.core.queue.FilePendingActionStore
import com.cooperwaters.core.queue.IdempotentRequestQueue
import com.cooperwaters.customer.data.CustomerRepository
import okhttp3.mockwebserver.MockWebServer
import java.io.File

/** Real repository + queue + cache over a MockWebServer, with instant (no-sleep) retries. */
fun testRepository(server: MockWebServer, dir: File, maxAttempts: Int = 3): CustomerRepository {
    val client = ApiClient(ApiConfig(server.url("/").toString().trimEnd('/'), "test"), InMemoryTokenStore("access", "refresh"))
    val queue = IdempotentRequestQueue(
        FilePendingActionStore(File(dir, "pending.json")),
        RetryPolicy(maxAttempts = maxAttempts, baseDelayMs = 1, maxDelayMs = 1, jitter = 0.0),
        sleeper = {},
    )
    return CustomerRepository(client.customerApi, JsonCache(File(dir, "cache")), queue, client.json)
}

/** Poll (real time) until [cond] holds; ViewModel work runs on real OkHttp/IO threads in these tests. */
fun waitUntil(timeoutMs: Long = 5_000, cond: () -> Boolean) {
    val end = System.currentTimeMillis() + timeoutMs
    while (!cond()) {
        if (System.currentTimeMillis() > end) throw AssertionError("condition not met within ${timeoutMs}ms")
        Thread.sleep(20)
    }
}

object Fixtures {
    const val CONFIG = """{"currency":"PGK","timeZone":"Pacific/Port_Moresby","cancelFreeUntil":"ACCEPTED","maxQuantity":3,"disputeCategories":["not_delivered","other"],"paymentMethods":["cod","cellmoney"],"cellmoneyTimeoutSec":300,"autoCompleteAfterSec":7200}"""
    const val PACKAGES = """[{"id":"11111111-1111-1111-1111-111111111111","name":"Small tank (1,000 L)","volumeLitres":1000,"priceToea":8000},{"id":"22222222-2222-2222-2222-222222222222","name":"Full truck (5,000 L)","volumeLitres":5000,"priceToea":30000}]"""
    const val LOCATIONS = """[{"id":"33333333-3333-3333-3333-333333333333","userId":"u","label":"Home","addressText":"Section 11, Lot 1, Boroko","lat":-9.4408,"lng":147.1783,"landmarkNotes":"Blue gate opposite the trade store","deletedAt":null,"createdAt":"2026-10-16T05:46:55.447Z","updatedAt":"2026-10-16T05:46:55.447Z"}]"""
    fun quote(qty: Int, unit: Long) = """{"package":{"id":"11111111-1111-1111-1111-111111111111","name":"Small tank (1,000 L)","volumeLitres":1000},"quantity":$qty,"unitPriceToea":$unit,"priceToea":${unit * qty}}"""
    fun order(id: String, status: String, method: String = "cod") =
        """{"id":"$id","shortCode":"CW-12345","status":"$status","package":{"id":"11111111-1111-1111-1111-111111111111","name":"Small tank (1,000 L)","volumeLitres":1000},"quantity":2,"unitPriceToea":8000,"priceToea":16000,"paymentMethod":"$method","paymentStatus":"pending","delivery":{"lat":-9.44,"lng":147.17,"address":"Section 11","notes":"Blue gate"},"cancelReason":null,"expiresAt":null,"timeline":{"createdAt":"2026-10-16T05:00:00.000Z","searchingAt":"2026-10-16T05:00:00.000Z"},"driver":null}"""
}
