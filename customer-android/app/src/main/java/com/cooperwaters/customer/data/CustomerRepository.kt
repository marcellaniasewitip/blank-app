package com.cooperwaters.customer.data

import com.cooperwaters.core.cache.JsonCache
import com.cooperwaters.core.cache.Loaded
import com.cooperwaters.core.cache.fetchOrCached
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.CreateOrderRequest
import com.cooperwaters.core.net.CreateOrderResponse
import com.cooperwaters.core.net.CustomerApi
import com.cooperwaters.core.net.CustomerConfig
import com.cooperwaters.core.net.Order
import com.cooperwaters.core.net.Page
import com.cooperwaters.core.net.Payment
import com.cooperwaters.core.net.SavedLocation
import com.cooperwaters.core.net.StartPaymentRequest
import com.cooperwaters.core.net.WaterPackage
import com.cooperwaters.core.net.apiCall
import com.cooperwaters.core.net.nullableApiCall
import com.cooperwaters.core.queue.IdempotentRequestQueue
import com.cooperwaters.core.queue.PendingAction
import com.cooperwaters.core.queue.QueueOutcome
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Customer data access: REST + last-known cache (screens render offline) + the idempotent queue for
 * "place order" and "start cell money payment" (never double-submitted, survive app restarts).
 */
class CustomerRepository(
    val api: CustomerApi,
    private val cache: JsonCache,
    val queue: IdempotentRequestQueue,
    private val json: Json,
) {
    suspend fun config(): Loaded<CustomerConfig> = cache.fetchOrCached("config", CustomerConfig.serializer()) { apiCall { api.config() } }

    suspend fun packages(): Loaded<List<WaterPackage>> =
        cache.fetchOrCached("packages", ListSerializer(WaterPackage.serializer())) { apiCall { api.packages() } }

    suspend fun locations(): Loaded<List<SavedLocation>> =
        cache.fetchOrCached("locations", ListSerializer(SavedLocation.serializer())) { apiCall { api.locations() } }

    suspend fun order(id: String): Loaded<Order> = cache.fetchOrCached("order_$id", Order.serializer()) { apiCall { api.order(id) } }

    suspend fun cacheOrder(order: Order) = cache.put("order_${order.id}", Order.serializer(), order)

    suspend fun recentOrders(): Loaded<Page<Order>> =
        cache.fetchOrCached("orders_first_page", Page.serializer(Order.serializer())) { apiCall { api.orders(limit = 20) } }

    suspend fun payment(orderId: String): ApiResult<Payment?> = nullableApiCall(json, Payment.serializer()) { api.payment(orderId) }

    // ───────────── Idempotent actions ─────────────

    /** A "Place order" that was saved but never confirmed (e.g. app killed offline). Resume it with the same key. */
    suspend fun pendingOrder(): PendingAction? = queue.find(TYPE_CREATE_ORDER).firstOrNull()

    fun decodeOrderRequest(action: PendingAction): CreateOrderRequest =
        IdempotentRequestQueue.decodeBody(action, CreateOrderRequest.serializer())

    /** Create the persisted action (new Idempotency-Key) for one tap of "Place order". */
    suspend fun newOrderAction(req: CreateOrderRequest): PendingAction =
        queue.create(TYPE_CREATE_ORDER, CreateOrderRequest.serializer(), req)

    suspend fun submitOrder(action: PendingAction): QueueOutcome<CreateOrderResponse> {
        val req = decodeOrderRequest(action)
        val outcome = queue.run(action) { key -> apiCall { api.createOrder(key, req) } }
        if (outcome is QueueOutcome.Success) cacheOrder(outcome.value.order)
        return outcome
    }

    suspend fun pendingPayment(orderId: String): PendingAction? = queue.find(TYPE_START_PAYMENT, orderId).firstOrNull()

    suspend fun newPaymentAction(orderId: String, msisdn: String): PendingAction =
        queue.create(TYPE_START_PAYMENT, StartPaymentRequest.serializer(), StartPaymentRequest(msisdn), targetId = orderId)

    suspend fun submitPayment(action: PendingAction): QueueOutcome<Payment> {
        val orderId = requireNotNull(action.targetId)
        val body = IdempotentRequestQueue.decodeBody(action, StartPaymentRequest.serializer())
        return queue.run(action) { key -> apiCall { api.startPayment(key, orderId, body) } }
    }

    /** Called on start/reconnect: resend saved requests with their original keys and bodies. */
    suspend fun drainPending() {
        queue.drain(
            mapOf(
                TYPE_CREATE_ORDER to { a ->
                    apiCall { api.createOrder(a.key, decodeOrderRequest(a)) }.also { r ->
                        if (r is ApiResult.Success) cacheOrder(r.value.order)
                    }
                },
                TYPE_START_PAYMENT to { a ->
                    apiCall { api.startPayment(a.key, requireNotNull(a.targetId), IdempotentRequestQueue.decodeBody(a, StartPaymentRequest.serializer())) }
                },
            ),
        )
    }

    companion object {
        const val TYPE_CREATE_ORDER = "create_order"
        const val TYPE_START_PAYMENT = "start_payment"
    }
}
