package com.cooperwaters.driver.ui.earnings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cooperwaters.core.android.ui.UiText
import com.cooperwaters.core.android.ui.toUiText
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.CursorPager
import com.cooperwaters.core.net.Earnings
import com.cooperwaters.core.net.Order
import com.cooperwaters.core.net.apiCall
import com.cooperwaters.driver.data.DriverRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EarningsUi(
    val period: String = "today",
    val loading: Boolean = true,
    val earnings: Earnings? = null,
    val fromCache: Boolean = false,
    val error: UiText? = null,
)

/** GET /driver/earnings?period=today|week|month */
class EarningsViewModel(private val repo: DriverRepository) : ViewModel() {
    private val _ui = MutableStateFlow(EarningsUi())
    val ui: StateFlow<EarningsUi> = _ui.asStateFlow()

    init {
        select("today")
    }

    fun select(period: String) {
        _ui.update { it.copy(period = period, loading = true, error = null) }
        viewModelScope.launch {
            val l = repo.earnings(period)
            _ui.update { if (it.period != period) it else it.copy(loading = false, earnings = l.value, fromCache = l.fromCache, error = if (l.value == null) l.error?.toUiText() else null) }
        }
    }
}

data class JobHistoryUi(
    val loading: Boolean = true,
    val items: List<Order> = emptyList(),
    val endReached: Boolean = false,
    val error: UiText? = null,
)

class JobHistoryViewModel(private val repo: DriverRepository) : ViewModel() {
    private val pager = CursorPager { cursor, limit -> apiCall { repo.api.orders(cursor, limit) } }
    private val _ui = MutableStateFlow(JobHistoryUi())
    val ui: StateFlow<JobHistoryUi> = _ui.asStateFlow()

    init {
        refresh()
    }

    fun refresh() = load { pager.refresh() }
    fun loadMore() = load { pager.loadMore() }

    private fun load(block: suspend () -> ApiResult<List<Order>>) {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = block()) {
                is ApiResult.Success -> _ui.update { it.copy(loading = false, items = r.value, endReached = pager.endReached) }
                is ApiResult.Failure -> _ui.update { it.copy(loading = false, error = r.error.toUiText()) }
            }
        }
    }
}
