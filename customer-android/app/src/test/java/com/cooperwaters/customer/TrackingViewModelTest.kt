package com.cooperwaters.customer

import com.cooperwaters.core.net.CwJson
import com.cooperwaters.core.net.Order
import com.cooperwaters.core.realtime.RealtimeEvent
import com.cooperwaters.customer.ui.tracking.TrackingViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class TrackingViewModelTest {
    @get:Rule val tmp = TemporaryFolder()
    private val server = MockWebServer()
    private val orderId = "44444444-4444-4444-4444-444444444444"
    @Volatile private var status = "SEARCHING"

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                return when {
                    path.endsWith("/customer/config") -> MockResponse().setBody(Fixtures.CONFIG)
                    path.endsWith("/orders/$orderId/cancel") -> {
                        if (status == "SEARCHING") {
                            status = "CANCELLED"
                            MockResponse().setBody(Fixtures.order(orderId, "CANCELLED"))
                        } else {
                            MockResponse().setResponseCode(409).setBody("""{"error":{"code":"cancel_not_allowed","message":"This order is accepted and can no longer be cancelled in the app."}}""")
                        }
                    }
                    path.endsWith("/orders/$orderId") -> MockResponse().setBody(Fixtures.order(orderId, status))
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
    }

    @After fun tearDown() {
        server.shutdown()
        Dispatchers.resetMain()
    }

    @Test fun cancelAllowedOnlyBeforeAcceptance() {
        val vm = TrackingViewModel(testRepository(server, tmp.root), orderId, emptyFlow(), emptyFlow())
        waitUntil { vm.state.value.order != null }
        assertTrue(vm.state.value.canCancel)
        vm.cancel("Changed my mind")
        waitUntil { vm.state.value.order?.status == "CANCELLED" }
        assertFalse(vm.state.value.canCancel)
    }

    @Test fun socketUpdatesStatusAndDriverLocation() {
        val events = MutableSharedFlow<RealtimeEvent>(extraBufferCapacity = 8)
        val vm = TrackingViewModel(testRepository(server, tmp.root), orderId, events, emptyFlow())
        waitUntil { vm.state.value.order != null }
        val accepted = CwJson.decodeFromString(Order.serializer(), Fixtures.order(orderId, "ACCEPTED"))
        events.tryEmit(RealtimeEvent.OrderUpdated(accepted))
        waitUntil { vm.state.value.order?.status == "ACCEPTED" }
        assertFalse(vm.state.value.canCancel) // cancelFreeUntil = ACCEPTED
        events.tryEmit(RealtimeEvent.DriverLocationChanged(orderId, -9.45, 147.19, "2026-10-16T05:10:00.000Z"))
        waitUntil { vm.state.value.driverLocation != null }
        assertEquals(-9.45, vm.state.value.driverLocation!!.lat, 0.0)
    }
}
