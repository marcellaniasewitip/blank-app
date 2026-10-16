package com.cooperwaters.driver

import com.cooperwaters.core.android.ui.UiText
import com.cooperwaters.core.net.CwJson
import com.cooperwaters.core.net.Offer
import com.cooperwaters.driver.data.DriverState
import com.cooperwaters.driver.ui.home.HomeViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.Collections

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    @get:Rule val tmp = TemporaryFolder()
    private val server = MockWebServer()
    private val acceptKeys: MutableList<String> = Collections.synchronizedList(mutableListOf())
    private val acceptPlan: MutableList<String> = Collections.synchronizedList(mutableListOf())
    @Volatile private var onlineResponse: MockResponse? = null
    @Volatile private var online = true

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val p = request.path.orEmpty()
                return when {
                    p.endsWith("/driver/config") -> json(Fixtures.CONFIG)
                    p.endsWith("/driver/me") -> json(Fixtures.profile(online))
                    p.endsWith("/driver/depots") -> json(Fixtures.DEPOTS)
                    p.endsWith("/driver/wallet") -> json(Fixtures.WALLET)
                    p.endsWith("/driver/orders/active") -> json("")
                    p.endsWith("/driver/offers") -> json("[${Fixtures.offer("o1")},${Fixtures.offer("o2")}]")
                    p.endsWith("/driver/online") -> onlineResponse ?: json(Fixtures.profile(true))
                    p.endsWith("/accept") -> {
                        acceptKeys += request.getHeader("Idempotency-Key").orEmpty()
                        when (if (acceptPlan.isEmpty()) "ok" else acceptPlan.removeAt(0)) {
                            "503" -> json("""{"error":{"code":"server_error","message":"down"}}""", 503)
                            "taken" -> json("""{"error":{"code":"order_taken","message":"Sorry, this job has already been taken"}}""", 409)
                            else -> json(Fixtures.order(p.split("/").dropLast(1).last(), "ACCEPTED"))
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

    private fun setup(): Pair<HomeViewModel, DriverState> {
        val env = TestEnv(server, tmp.root)
        val state = DriverState(env.repo, emptyFlow(), CoroutineScope(SupervisorJob() + Dispatchers.Unconfined))
        val vm = HomeViewModel(env.repo, state)
        waitUntil { !vm.ui.value.refreshing && state.offers.value.size == 2 && vm.ui.value.depots.size == 2 }
        return vm to state
    }

    private fun offer(id: String): Offer = CwJson.decodeFromString(Offer.serializer(), Fixtures.offer(id))

    @Test fun acceptRetriesWithSameKeyAndOpensJob() {
        val (vm, state) = setup()
        acceptPlan += listOf("503", "503")
        vm.accept(offer("o1"))
        waitUntil { vm.ui.value.acceptedOrderId != null }
        assertEquals("o1", vm.ui.value.acceptedOrderId)
        assertEquals(3, acceptKeys.size)
        assertEquals(1, acceptKeys.toSet().size)
        assertEquals("o1", state.activeOrder.value?.id)
        assertTrue(state.offers.value.none { it.orderId == "o1" })
    }

    @Test fun losingTheRaceShowsAlreadyTakenAndRemovesOffer() {
        val (vm, state) = setup()
        acceptPlan += "taken"
        vm.accept(offer("o2"))
        waitUntil { vm.ui.value.accepting == null && vm.ui.value.error != null }
        assertEquals(UiText.Res(R.string.home_offer_taken), vm.ui.value.error)
        assertEquals(listOf("o1"), state.offers.value.map { it.orderId })
        assertEquals(1, acceptKeys.size)
    }

    @Test fun notAtDepotNamesTheNearestDepot() {
        val (vm, _) = setup()
        onlineResponse = json("""{"error":{"code":"not_at_depot","message":"Go to a Cooper Waters depot to go online"}}""", 422)
        vm.goOnline(-9.41, 147.16)
        waitUntil { !vm.ui.value.togglingOnline && vm.ui.value.error != null }
        val e = vm.ui.value.error as UiText.Res
        assertEquals(R.string.home_not_at_depot, e.id)
        assertEquals("Gerehu Depot", e.args[0])
    }

    @Test fun walletBelowMinimumBlocks() {
        val (vm, state) = setup()
        onlineResponse = json("""{"error":{"code":"wallet_below_minimum","message":"Top up your wallet to at least K50.00 to go online","details":{"balanceToea":1200,"minBalanceToea":5000}}}""", 409)
        vm.goOnline(-9.4438, 147.1803)
        waitUntil { !vm.ui.value.togglingOnline && vm.ui.value.error != null }
        assertEquals(UiText.Raw("Top up your wallet to at least K50.00 to go online"), vm.ui.value.error)
        assertTrue(state.wallet.value!!.blocked)
        assertEquals("K38.00", HomeViewModel.shortfallText(state.wallet.value!!))
    }
}
