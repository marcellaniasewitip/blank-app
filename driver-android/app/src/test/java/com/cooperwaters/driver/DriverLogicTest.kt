package com.cooperwaters.driver

import com.cooperwaters.core.android.ui.UiText
import com.cooperwaters.core.net.CwJson
import com.cooperwaters.core.net.Offer
import com.cooperwaters.core.net.Order
import com.cooperwaters.core.net.WalletUpdate
import com.cooperwaters.core.realtime.RealtimeEvent
import com.cooperwaters.driver.data.DriverState
import com.cooperwaters.driver.ui.job.JobStep
import com.cooperwaters.driver.ui.job.needsPosition
import com.cooperwaters.driver.ui.job.nextStep
import com.cooperwaters.driver.ui.onboarding.DriverStage
import com.cooperwaters.driver.ui.onboarding.stageFor
import com.cooperwaters.driver.ui.wallet.TopupUi
import com.cooperwaters.driver.ui.wallet.TopupViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant
import java.util.Collections

@OptIn(ExperimentalCoroutinesApi::class)
class DriverLogicTest {
    @get:Rule val tmp = TemporaryFolder()
    private val server = MockWebServer()
    private val topupKeys: MutableList<String> = Collections.synchronizedList(mutableListOf())
    private val topupBodies: MutableList<String> = Collections.synchronizedList(mutableListOf())
    private val topupPlan: MutableList<String> = Collections.synchronizedList(mutableListOf())

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val p = request.path.orEmpty()
                return when {
                    p.endsWith("/driver/config") -> json(Fixtures.CONFIG)
                    p.endsWith("/driver/wallet") -> json(Fixtures.WALLET.replace("\"shortfallToea\":0", "\"shortfallToea\":3800"))
                    p.endsWith("/driver/wallet/topups") -> {
                        topupKeys += request.getHeader("Idempotency-Key").orEmpty()
                        topupBodies += request.body.readUtf8()
                        if (topupPlan.isNotEmpty() && topupPlan.removeAt(0) == "503") {
                            json("""{"error":{"code":"server_error","message":"down"}}""", 503)
                        } else {
                            json("""{"topup":{"id":"t1","method":"bank_transfer","amountToea":5000,"referenceText":"BSP123","status":"pending"},"payment":null}""", 201)
                        }
                    }
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

    @Test fun stagesAndJobSteps() {
        assertEquals(DriverStage.WORKING, stageFor("approved"))
        assertEquals(DriverStage.WAITING, stageFor("pending_approval"))
        assertEquals(DriverStage.WAITING, stageFor("suspended"))
        assertEquals(DriverStage.ONBOARDING, stageFor("pending_docs"))
        assertEquals(DriverStage.ONBOARDING, stageFor("rejected"))
        assertEquals(JobStep.ARRIVE_DEPOT, nextStep("ACCEPTED"))
        assertEquals(JobStep.CONFIRM_LOADED, nextStep("LOADING"))
        assertEquals(JobStep.MARK_ARRIVED, nextStep("EN_ROUTE"))
        assertEquals(JobStep.MARK_DELIVERED, nextStep("ARRIVED"))
        assertEquals(JobStep.AWAIT_CUSTOMER, nextStep("DELIVERED"))
        assertEquals(JobStep.DONE, nextStep("COMPLETED"))
        assertTrue(JobStep.ARRIVE_DEPOT.needsPosition() && JobStep.CONFIRM_LOADED.needsPosition())
    }

    @Test fun driverStateFollowsSocketEvents() {
        val env = TestEnv(server, tmp.root)
        val events = MutableSharedFlow<RealtimeEvent>(extraBufferCapacity = 16)
        val now = Instant.parse("2026-10-16T06:00:00Z")
        val state = DriverState(env.repo, events, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined), now = { now })
        val live = CwJson.decodeFromString(Offer.serializer(), Fixtures.offer("o1", "2026-10-16T06:05:00.000Z"))
        val stale = CwJson.decodeFromString(Offer.serializer(), Fixtures.offer("o2", "2026-10-16T05:59:00.000Z"))
        events.tryEmit(RealtimeEvent.OfferReceived(live))
        events.tryEmit(RealtimeEvent.OfferReceived(stale)) // already expired → pruned
        assertEquals(listOf("o1"), state.offers.value.map { it.orderId })
        events.tryEmit(RealtimeEvent.OfferRevoked("o1", "taken"))
        assertTrue(state.offers.value.isEmpty())

        events.tryEmit(RealtimeEvent.WalletUpdated(WalletUpdate(1200, 5000, true)))
        assertTrue(state.wallet.value!!.blocked)

        val accepted = CwJson.decodeFromString(Order.serializer(), Fixtures.order("o3", "ACCEPTED"))
        events.tryEmit(RealtimeEvent.OrderUpdated(accepted))
        assertEquals("o3", state.activeOrder.value?.id)
        // Partial cancel payload for the same order clears the active job.
        events.tryEmit(RealtimeEvent.OrderUpdated(Order(id = "o3", shortCode = "CW-1", status = "CANCELLED")))
        assertNull(state.activeOrder.value)
    }

    @Test fun topupValidationParsesKinaExactly() {
        val env = TestEnv(server, tmp.root)
        val vm = TopupViewModel(env.repo, env.uploader, "+67570000003")
        waitUntil { vm.ui.value.amount.isNotEmpty() }
        assertEquals("38.00", vm.ui.value.amount) // pre-filled with the shortfall
        assertEquals(UiText.Res(R.string.topup_amount_invalid), vm.validate(TopupUi(amount = "12.345", reference = "x")))
        assertEquals(R.string.topup_amount_min, (vm.validate(TopupUi(amount = "0.50", reference = "x")) as UiText.Res).id)
        assertEquals(UiText.Res(R.string.topup_reference_required), vm.validate(TopupUi(amount = "50", reference = " ")))
        assertEquals(UiText.Res(R.string.topup_msisdn_invalid), vm.validate(TopupUi(method = TopupUi.METHOD_CELLMONEY, amount = "50", msisdn = "12")))
        assertNull(vm.validate(TopupUi(amount = "K1,250.50", reference = "BSP123")))
    }

    @Test fun bankTopupRetriesWithSameKey() {
        val env = TestEnv(server, tmp.root)
        val vm = TopupViewModel(env.repo, env.uploader, "+67570000003")
        waitUntil { vm.ui.value.amount.isNotEmpty() }
        vm.onAmount("50")
        vm.onReference("BSP123")
        topupPlan += listOf("503", "503")
        vm.submit()
        waitUntil { vm.ui.value.result != null }
        assertEquals(3, topupKeys.size)
        assertEquals(1, topupKeys.toSet().size)
        assertEquals(1, topupBodies.toSet().size)
        assertTrue(topupBodies.first().contains("\"amountToea\":5000"))
        assertEquals("pending", vm.ui.value.result!!.status)
    }
}
