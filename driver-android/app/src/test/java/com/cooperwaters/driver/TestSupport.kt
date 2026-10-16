package com.cooperwaters.driver

import com.cooperwaters.core.auth.InMemoryTokenStore
import com.cooperwaters.core.cache.JsonCache
import com.cooperwaters.core.net.ApiClient
import com.cooperwaters.core.net.ApiConfig
import com.cooperwaters.core.net.RetryPolicy
import com.cooperwaters.core.net.Uploader
import com.cooperwaters.core.queue.FilePendingActionStore
import com.cooperwaters.core.queue.IdempotentRequestQueue
import com.cooperwaters.driver.data.DriverRepository
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.io.File

class TestEnv(server: MockWebServer, dir: File, maxAttempts: Int = 3) {
    val client = ApiClient(ApiConfig(server.url("/").toString().trimEnd('/'), "test"), InMemoryTokenStore("access", "refresh"))
    val queue = IdempotentRequestQueue(
        FilePendingActionStore(File(dir, "pending.json")),
        RetryPolicy(maxAttempts = maxAttempts, baseDelayMs = 1, maxDelayMs = 1, jitter = 0.0),
        sleeper = {},
    )
    val repo = DriverRepository(client.driverApi, JsonCache(File(dir, "cache")), queue, client.json)
    val uploader = Uploader(client.driverApi, client.plainHttp)
}

fun waitUntil(timeoutMs: Long = 5_000, cond: () -> Boolean) {
    val end = System.currentTimeMillis() + timeoutMs
    while (!cond()) {
        if (System.currentTimeMillis() > end) throw AssertionError("condition not met within ${timeoutMs}ms")
        Thread.sleep(20)
    }
}

fun json(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

object Fixtures {
    const val CONFIG = """{"requiredDocuments":["drivers_licence","vehicle_registration","national_id","truck_photo"],"minBalanceToea":5000,"onlineRequiresDepot":true,"locationIntervalSec":20,"disputeCategories":["not_delivered","other"],"merchantNumber":""}"""
    const val DEPOTS = """[{"id":"d1","name":"Gerehu Depot","lat":-9.402,"lng":147.162,"geofenceRadiusM":150,"geofencePolygon":null},{"id":"d2","name":"Town Depot","lat":-9.4438,"lng":147.1803,"geofenceRadiusM":150,"geofencePolygon":null}]"""
    const val WALLET = """{"walletId":"w","balanceToea":20000,"minBalanceToea":5000,"blocked":false,"shortfallToea":0,"withdrawableToea":15000,"payoutMinToea":1000,"pendingTopups":{"count":0,"amountToea":0}}"""
    fun profile(online: Boolean, balance: Long = 20000) =
        """{"id":"drv","name":"Driver 3","phone":"+67570000003","status":"approved","rejectReason":null,"online":$online,"ratingAvg":0,"ratingCount":0,"truck":{"id":"t","plate":"CW103","capacityLitres":5000,"photoKey":null},"documents":[],"wallet":{"balanceToea":$balance,"minBalanceToea":5000,"blocked":${balance < 5000}},"canGoOnline":${balance >= 5000}}"""
    fun offer(orderId: String, expiresAt: String = "2099-01-01T00:00:00.000Z") =
        """{"offerId":"of-$orderId","orderId":"$orderId","shortCode":"CW-1","package":"Small tank","volumeLitres":2000,"quantity":2,"distanceM":1200.5,"earningsToea":14400,"priceToea":16000,"paymentMethod":"cod","expiresAt":"$expiresAt","delivery":{"lat":-9.44,"lng":147.18,"address":"Boroko","notes":"Blue gate"}}"""
    fun order(id: String, status: String) =
        """{"id":"$id","shortCode":"CW-1","status":"$status","package":{"id":"p","name":"Small tank","volumeLitres":1000},"quantity":2,"unitPriceToea":8000,"priceToea":16000,"paymentMethod":"cod","paymentStatus":"pending","delivery":{"lat":-9.44,"lng":147.18,"address":"Boroko","notes":"Blue gate"},"timeline":{"acceptedAt":"2026-10-16T05:00:00.000Z"},"commissionToea":1600,"earningsToea":14400,"customer":{"name":"Mary","phone":"+67571000001"}}"""
}
