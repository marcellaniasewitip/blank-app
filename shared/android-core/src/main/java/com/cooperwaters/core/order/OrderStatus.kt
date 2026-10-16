package com.cooperwaters.core.order

import com.cooperwaters.core.net.Order

/** Order lifecycle (spec §6), mirrored from backend/src/orders/state-machine.ts. */
object OrderStatus {
    const val PENDING_PAYMENT = "PENDING_PAYMENT"
    const val SEARCHING = "SEARCHING"
    const val ACCEPTED = "ACCEPTED"
    const val LOADING = "LOADING"
    const val EN_ROUTE = "EN_ROUTE"
    const val ARRIVED = "ARRIVED"
    const val DELIVERED = "DELIVERED"
    const val COMPLETED = "COMPLETED"
    const val CANCELLED = "CANCELLED"
    const val EXPIRED = "EXPIRED"
    const val FAILED = "FAILED"
    const val DISPUTED = "DISPUTED"

    val PROGRESS = listOf(PENDING_PAYMENT, SEARCHING, ACCEPTED, LOADING, EN_ROUTE, ARRIVED, DELIVERED, COMPLETED)
    val TERMINAL = setOf(COMPLETED, CANCELLED, EXPIRED, FAILED)
    /** Driver location is visible to the customer in these. */
    val TRACKABLE = setOf(ACCEPTED, LOADING, EN_ROUTE, ARRIVED)
    /** A driver's job is in progress. */
    val ACTIVE_DRIVER = setOf(ACCEPTED, LOADING, EN_ROUTE, ARRIVED)
    private val CUSTOMER_CANCELLABLE = setOf(PENDING_PAYMENT, SEARCHING, ACCEPTED, LOADING, EN_ROUTE, ARRIVED)
    private val DISPUTABLE = setOf(ACCEPTED, LOADING, EN_ROUTE, ARRIVED, DELIVERED, COMPLETED)

    fun isTerminal(status: String) = status in TERMINAL
    fun isTrackable(status: String) = status in TRACKABLE
    fun isDisputable(status: String) = status in DISPUTABLE

    /** Same rule as the backend: strictly before `config.cancelFreeUntil`, and cancellable by a customer at all. */
    fun customerMayCancel(status: String, cancelFreeUntil: String): Boolean {
        val idx = PROGRESS.indexOf(status)
        val limit = PROGRESS.indexOf(cancelFreeUntil)
        if (idx < 0 || limit < 0) return false
        return idx < limit && status in CUSTOMER_CANCELLABLE
    }
}

/** One row of the tracking timeline. */
data class TimelineStep(val status: String, val at: String?, val done: Boolean, val current: Boolean)

object OrderTimelines {
    /**
     * Steps to show for [order]: the normal progression (skipping PENDING_PAYMENT for cash orders),
     * with an extra final step for CANCELLED / EXPIRED / FAILED / DISPUTED.
     */
    fun steps(order: Order): List<TimelineStep> {
        val t = order.timeline
        val times = mapOf(
            OrderStatus.PENDING_PAYMENT to t.paymentPendingAt,
            OrderStatus.SEARCHING to t.searchingAt,
            OrderStatus.ACCEPTED to t.acceptedAt,
            OrderStatus.LOADING to t.loadingAt,
            OrderStatus.EN_ROUTE to t.enRouteAt,
            OrderStatus.ARRIVED to t.arrivedAt,
            OrderStatus.DELIVERED to t.deliveredAt,
            OrderStatus.COMPLETED to t.completedAt,
            OrderStatus.CANCELLED to t.cancelledAt,
            OrderStatus.EXPIRED to t.expiredAt,
            OrderStatus.FAILED to t.failedAt,
            OrderStatus.DISPUTED to t.disputedAt,
        )
        val progression = OrderStatus.PROGRESS.filter { it != OrderStatus.PENDING_PAYMENT || order.paymentMethod == "cellmoney" }
        val offTrack = order.status !in OrderStatus.PROGRESS
        val currentIdx = progression.indexOf(order.status)
        val steps = mutableListOf<TimelineStep>()
        for ((i, s) in progression.withIndex()) {
            val at = times[s]
            val done = if (offTrack) at != null else i <= currentIdx
            if (offTrack && at == null) continue
            steps += TimelineStep(s, at, done = done, current = !offTrack && i == currentIdx)
        }
        if (offTrack) steps += TimelineStep(order.status, times[order.status], done = true, current = true)
        return steps
    }
}
