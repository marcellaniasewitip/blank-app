package com.cooperwaters.driver.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cooperwaters.core.android.ui.UiText
import com.cooperwaters.core.android.ui.toUiText
import com.cooperwaters.core.money.Money
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.Depot
import com.cooperwaters.core.net.ErrorCodes
import com.cooperwaters.core.net.Offer
import com.cooperwaters.core.net.PositionRequest
import com.cooperwaters.core.net.WalletBrief
import com.cooperwaters.core.net.apiCall
import com.cooperwaters.core.net.apiResponse
import com.cooperwaters.core.queue.QueueOutcome
import com.cooperwaters.core.util.Geo
import com.cooperwaters.driver.R
import com.cooperwaters.driver.data.DriverRepository
import com.cooperwaters.driver.data.DriverState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

data class HomeUi(
    val refreshing: Boolean = false,
    val togglingOnline: Boolean = false,
    val depots: List<Depot> = emptyList(),
    /** Last known position (for depot distances). */
    val myLat: Double? = null,
    val myLng: Double? = null,
    /** orderId being accepted / declined (buttons disabled while in flight). */
    val accepting: String? = null,
    val declining: String? = null,
    val message: UiText? = null,
    val error: UiText? = null,
    /** Accepted job: navigate to it. */
    val acceptedOrderId: String? = null,
) {
    fun nearestDepot(): Pair<Depot, Double>? {
        val lat = myLat ?: return null
        val lng = myLng ?: return null
        return depots.map { it to Geo.distanceM(lat, lng, it.lat, it.lng) }.minByOrNull { it.second }
    }
}

/**
 * Online/offline toggle (depot- and wallet-gated by the server), incoming offers with accept/decline,
 * and the low-balance banner. Accept is idempotent and race-safe: losing the race shows "already taken".
 */
class HomeViewModel(
    private val repo: DriverRepository,
    val driverState: DriverState,
) : ViewModel() {
    private val _ui = MutableStateFlow(HomeUi())
    val ui: StateFlow<HomeUi> = _ui.asStateFlow()

    init {
        refresh()
        viewModelScope.launch {
            while (true) {
                delay(5_000)
                driverState.pruneExpiredOffers()
            }
        }
        // Backup polling for offers while online (socket may be down on 3G).
        viewModelScope.launch {
            while (true) {
                delay(30_000)
                if (driverState.profile.value?.online == true) driverState.refreshOffers()
            }
        }
    }

    fun refresh() {
        _ui.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            driverState.refreshAll()
            repo.depots().value?.let { d -> _ui.update { it.copy(depots = d) } }
            repo.wallet().value?.let { w -> driverState.setWallet(WalletBrief(w.balanceToea, w.minBalanceToea, w.blocked)) }
            _ui.update { it.copy(refreshing = false) }
        }
    }

    fun onMyLocation(lat: Double, lng: Double) = _ui.update { it.copy(myLat = lat, myLng = lng) }

    fun locationUnavailable() = _ui.update { it.copy(togglingOnline = false, error = UiText.res(R.string.home_location_needed)) }

    fun startToggling() = _ui.update { it.copy(togglingOnline = true, error = null, message = null) }

    fun goOnline(lat: Double, lng: Double) {
        _ui.update { it.copy(togglingOnline = true, myLat = lat, myLng = lng, error = null, message = null) }
        viewModelScope.launch {
            when (val r = apiCall { repo.api.goOnline(PositionRequest(lat, lng)) }) {
                is ApiResult.Success -> {
                    driverState.setProfile(r.value)
                    repo.cacheProfile(r.value)
                    driverState.refreshOffers()
                    _ui.update { it.copy(togglingOnline = false, message = UiText.res(R.string.home_now_online)) }
                }
                is ApiResult.Failure -> {
                    val e = r.error
                    val msg = when {
                        e.hasCode(ErrorCodes.NOT_AT_DEPOT) -> _ui.value.nearestDepot()?.let { (d, m) ->
                            UiText.res(R.string.home_not_at_depot, d.name, Geo.formatDistance(m))
                        } ?: e.toUiText()
                        else -> e.toUiText()
                    }
                    if (e.hasCode(ErrorCodes.WALLET_BELOW_MINIMUM)) applyWalletDetails(e.details)
                    _ui.update { it.copy(togglingOnline = false, error = msg) }
                }
            }
        }
    }

    fun goOffline() {
        _ui.update { it.copy(togglingOnline = true, error = null, message = null) }
        viewModelScope.launch {
            when (val r = apiCall { repo.api.goOffline() }) {
                is ApiResult.Success -> {
                    driverState.setProfile(r.value)
                    repo.cacheProfile(r.value)
                    _ui.update { it.copy(togglingOnline = false) }
                }
                is ApiResult.Failure -> _ui.update { it.copy(togglingOnline = false, error = r.error.toUiText()) }
            }
        }
    }

    fun accept(offer: Offer) {
        if (_ui.value.accepting != null) return
        _ui.update { it.copy(accepting = offer.orderId, error = null, message = null) }
        viewModelScope.launch {
            val action = repo.newAcceptAction(offer)
            when (val out = repo.accept(action)) {
                is QueueOutcome.Success -> {
                    driverState.setActiveOrder(out.value)
                    _ui.update { it.copy(accepting = null, acceptedOrderId = out.value.id) }
                }
                is QueueOutcome.Failed -> {
                    val e = out.error
                    if (e.hasCode(ErrorCodes.ORDER_TAKEN) || e.httpStatus == 403 || e.httpStatus == 404) driverState.removeOffer(offer.orderId)
                    if (e.hasCode(ErrorCodes.WALLET_BELOW_MINIMUM)) applyWalletDetails(e.details)
                    val msg = if (e.hasCode(ErrorCodes.ORDER_TAKEN)) UiText.res(R.string.home_offer_taken) else e.toUiText()
                    _ui.update { it.copy(accepting = null, error = msg) }
                }
                is QueueOutcome.StillPending -> _ui.update { it.copy(accepting = null, error = UiText.res(R.string.home_accept_pending)) }
                QueueOutcome.Expired -> {
                    driverState.removeOffer(offer.orderId)
                    _ui.update { it.copy(accepting = null, error = UiText.res(R.string.home_offer_expired)) }
                }
                QueueOutcome.AlreadyHandled -> {
                    driverState.refreshActive()
                    _ui.update { it.copy(accepting = null, acceptedOrderId = driverState.activeOrder.value?.id) }
                }
            }
        }
    }

    fun decline(offer: Offer) {
        if (_ui.value.declining != null) return
        _ui.update { it.copy(declining = offer.orderId) }
        viewModelScope.launch {
            apiResponse { repo.api.decline(offer.orderId) }
            driverState.removeOffer(offer.orderId) // remove locally regardless: the offer is no longer wanted
            _ui.update { it.copy(declining = null) }
        }
    }

    fun consumeAccepted() = _ui.update { it.copy(acceptedOrderId = null) }

    fun clearMessages() = _ui.update { it.copy(error = null, message = null) }

    private fun applyWalletDetails(details: kotlinx.serialization.json.JsonElement?) {
        val obj = try { details?.jsonObject } catch (e: IllegalArgumentException) { null } ?: return
        val bal = obj["balanceToea"]?.jsonPrimitive?.longOrNull ?: return
        val min = obj["minBalanceToea"]?.jsonPrimitive?.longOrNull ?: return
        driverState.setWallet(WalletBrief(bal, min, bal < min))
    }

    companion object {
        fun shortfallText(w: WalletBrief): String = Money.format((w.minBalanceToea - w.balanceToea).coerceAtLeast(0))
    }
}
