package com.cooperwaters.core

import com.cooperwaters.core.net.Order
import com.cooperwaters.core.net.OrderTimeline
import com.cooperwaters.core.order.OrderStatus
import com.cooperwaters.core.order.OrderTimelines
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OrderStatusTest {
    @Test fun cancelRuleMatchesBackend() {
        assertTrue(OrderStatus.customerMayCancel("SEARCHING", "ACCEPTED"))
        assertTrue(OrderStatus.customerMayCancel("PENDING_PAYMENT", "ACCEPTED"))
        assertFalse(OrderStatus.customerMayCancel("ACCEPTED", "ACCEPTED"))
        assertTrue(OrderStatus.customerMayCancel("ACCEPTED", "LOADING"))
        assertFalse(OrderStatus.customerMayCancel("DELIVERED", "COMPLETED"))
        assertFalse(OrderStatus.customerMayCancel("CANCELLED", "ARRIVED"))
        assertFalse(OrderStatus.customerMayCancel("SEARCHING", "bogus"))
    }

    @Test fun timelineForCashOrderSkipsPayment() {
        val o = Order(id = "1", status = "EN_ROUTE", paymentMethod = "cod",
            timeline = OrderTimeline(searchingAt = "a", acceptedAt = "b", loadingAt = "c", enRouteAt = "d"))
        val steps = OrderTimelines.steps(o)
        assertEquals(listOf("SEARCHING", "ACCEPTED", "LOADING", "EN_ROUTE", "ARRIVED", "DELIVERED", "COMPLETED"), steps.map { it.status })
        assertEquals(4, steps.count { it.done })
        assertEquals("EN_ROUTE", steps.single { it.current }.status)
    }

    @Test fun timelineForCancelledOrderShowsOnlyReachedSteps() {
        val o = Order(id = "1", status = "CANCELLED", paymentMethod = "cellmoney",
            timeline = OrderTimeline(paymentPendingAt = "a", searchingAt = "b", cancelledAt = "c"))
        val steps = OrderTimelines.steps(o)
        assertEquals(listOf("PENDING_PAYMENT", "SEARCHING", "CANCELLED"), steps.map { it.status })
        assertTrue(steps.last().current)
    }
}
