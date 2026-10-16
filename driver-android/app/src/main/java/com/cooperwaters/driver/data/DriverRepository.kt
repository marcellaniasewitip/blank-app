package com.cooperwaters.driver.data

import com.cooperwaters.core.cache.JsonCache
import com.cooperwaters.core.cache.Loaded
import com.cooperwaters.core.cache.fetchOrCached
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.Depot
import com.cooperwaters.core.net.DriverApi
import com.cooperwaters.core.net.DriverConfig
import com.cooperwaters.core.net.DriverProfile
import com.cooperwaters.core.net.Earnings
import com.cooperwaters.core.net.Offer
import com.cooperwaters.core.net.Order
import com.cooperwaters.core.net.Payout
import com.cooperwaters.core.net.TopupRequest
import com.cooperwaters.core.net.TopupResponse
import com.cooperwaters.core.net.WalletSummary
import com.cooperwaters.core.net.WithdrawalRequest
import com.cooperwaters.core.net.apiCall
import com.cooperwaters.core.net.nullableApiCall
import com.cooperwaters.core.queue.IdempotentRequestQueue
import com.cooperwaters.core.queue.PendingAction
import com.cooperwaters.core.queue.QueueOutcome
import com.cooperwaters.core.time.PomTime
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * Driver data access: REST + last-known cache (screens render offline) + idempotent queue for
 * accept / top-up / withdrawal (one Idempotency-Key per tap, reused for every retry, persisted on disk).
 */
class DriverRepository(
    val api: DriverApi,
    private val cache: JsonCache,
    val queue: IdempotentRequestQueue,
    private val json: Json,
) {
    suspend fun profile(): Loaded<DriverProfile> = cache.fetchOrCached("profile", DriverProfile.serializer()) { apiCall { api.me() } }
    suspend fun config(): Loaded<DriverConfig> = cache.fetchOrCached("config", DriverConfig.serializer()) { apiCall { api.config() } }
    suspend fun depots(): Loaded<List<Depot>> = cache.fetchOrCached("depots", ListSerializer(Depot.serializer())) { apiCall { api.depots() } }
    suspend fun wallet(): Loaded<WalletSummary> = cache.fetchOrCached("wallet", WalletSummary.serializer()) { apiCall { api.wallet() } }
    suspend fun earnings(period: String): Loaded<Earnings> = cache.fetchOrCached("earnings_$period", Earnings.serializer()) { apiCall { api.earnings(period) } }
    suspend fun offers(): ApiResult<List<Offer>> = apiCall { api.offers() }

    /** The job in progress, or null. Cached so the job screen works offline. */
    suspend fun activeOrder(): Loaded<Order?> {
        val r = nullableApiCall(json, Order.serializer()) { api.activeOrder() }
        return when (r) {
            is ApiResult.Success -> {
                val o = r.value
                if (o != null) cacheOrder(o) else cache.remove(KEY_ACTIVE)
                Loaded(o, fromCache = false, error = null)
            }
            is ApiResult.Failure -> Loaded(cache.get(KEY_ACTIVE, Order.serializer()), fromCache = true, error = r.error)
        }
    }

    suspend fun cacheOrder(o: Order) {
        cache.put(KEY_ACTIVE, Order.serializer(), o)
        cache.put("order_${o.id}", Order.serializer(), o)
    }

    suspend fun cachedOrder(id: String): Order? = cache.get("order_$id", Order.serializer())

    suspend fun cacheProfile(p: DriverProfile) = cache.put("profile", DriverProfile.serializer(), p)

    // ───────────── Idempotent actions ─────────────

    /** One tap on "Accept". Expires with the offer so a stale accept is never replayed hours later. */
    suspend fun newAcceptAction(offer: Offer): PendingAction =
        queue.find(TYPE_ACCEPT, offer.orderId).firstOrNull()
            ?: queue.create(TYPE_ACCEPT, String.serializer(), offer.orderId, targetId = offer.orderId, expiresAtMs = PomTime.parse(offer.expiresAt)?.toEpochMilli())

    suspend fun accept(action: PendingAction): QueueOutcome<Order> {
        val orderId = requireNotNull(action.targetId)
        val out = queue.run(action) { key -> apiCall { api.accept(key, orderId) } }
        if (out is QueueOutcome.Success) cacheOrder(out.value)
        return out
    }

    suspend fun pendingTopup(): PendingAction? = queue.find(TYPE_TOPUP).firstOrNull()
    suspend fun newTopupAction(req: TopupRequest): PendingAction = queue.create(TYPE_TOPUP, TopupRequest.serializer(), req)
    fun decodeTopup(a: PendingAction): TopupRequest = IdempotentRequestQueue.decodeBody(a, TopupRequest.serializer())
    suspend fun topup(action: PendingAction): QueueOutcome<TopupResponse> {
        val body = decodeTopup(action)
        return queue.run(action) { key -> apiCall { api.topup(key, body) } }
    }

    suspend fun pendingWithdrawal(): PendingAction? = queue.find(TYPE_WITHDRAWAL).firstOrNull()
    suspend fun newWithdrawalAction(req: WithdrawalRequest): PendingAction = queue.create(TYPE_WITHDRAWAL, WithdrawalRequest.serializer(), req)
    fun decodeWithdrawal(a: PendingAction): WithdrawalRequest = IdempotentRequestQueue.decodeBody(a, WithdrawalRequest.serializer())
    suspend fun withdraw(action: PendingAction): QueueOutcome<Payout> {
        val body = decodeWithdrawal(action)
        return queue.run(action) { key -> apiCall { api.withdraw(key, body) } }
    }

    /** Resend saved actions with their original keys (start / reconnect). Expired accepts are dropped by the queue. */
    suspend fun drainPending() {
        queue.drain(
            mapOf(
                TYPE_ACCEPT to { a -> apiCall { api.accept(a.key, requireNotNull(a.targetId)) }.also { if (it is ApiResult.Success) cacheOrder(it.value) } },
                TYPE_TOPUP to { a -> apiCall { api.topup(a.key, decodeTopup(a)) } },
                TYPE_WITHDRAWAL to { a -> apiCall { api.withdraw(a.key, decodeWithdrawal(a)) } },
            ),
        )
    }

    companion object {
        const val TYPE_ACCEPT = "accept"
        const val TYPE_TOPUP = "topup"
        const val TYPE_WITHDRAWAL = "withdrawal"
        private const val KEY_ACTIVE = "active_order"
    }
}
