package com.cooperwaters.customer.ui.tracking

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.cooperwaters.core.android.ui.ErrorCard
import com.cooperwaters.core.android.ui.Labels
import com.cooperwaters.core.android.ui.LoadingButton
import com.cooperwaters.core.android.ui.UiText
import com.cooperwaters.core.android.ui.toUiText
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.DisputeRequest
import com.cooperwaters.core.net.RateRequest
import com.cooperwaters.core.net.apiCall
import com.cooperwaters.customer.R
import com.cooperwaters.customer.data.CustomerRepository
import com.cooperwaters.customer.ui.common.ScreenScaffold
import com.cooperwaters.customer.ui.common.containerViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FeedbackState(
    val stars: Int = 0,
    val comment: String = "",
    val categories: List<String> = emptyList(),
    val category: String? = null,
    val sending: Boolean = false,
    val done: Boolean = false,
    val error: UiText? = null,
)

/** Rate the driver (1–5 stars) or raise a dispute for an order. */
class FeedbackViewModel(private val repo: CustomerRepository, private val orderId: String) : ViewModel() {
    private val _state = MutableStateFlow(FeedbackState())
    val state: StateFlow<FeedbackState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val cats = repo.config().value?.disputeCategories.orEmpty()
            _state.update { it.copy(categories = cats.ifEmpty { listOf("not_delivered", "short_volume", "quality", "payment", "behaviour", "other") }) }
        }
    }

    fun setStars(n: Int) = _state.update { it.copy(stars = n.coerceIn(1, 5), error = null) }
    fun setComment(v: String) = _state.update { it.copy(comment = v.take(2000), error = null) }
    fun setCategory(c: String) = _state.update { it.copy(category = c, error = null) }

    fun submitRating() {
        val s = _state.value
        if (s.stars !in 1..5) {
            _state.update { it.copy(error = UiText.res(R.string.rate_choose_stars)) }
            return
        }
        send { apiCall { repo.api.rate(orderId, RateRequest(s.stars, s.comment.trim().take(500).ifBlank { null })) } }
    }

    fun submitDispute() {
        val s = _state.value
        val cat = s.category
        when {
            cat == null -> { _state.update { it.copy(error = UiText.res(R.string.dispute_choose_category)) }; return }
            s.comment.isBlank() -> { _state.update { it.copy(error = UiText.res(R.string.dispute_describe)) }; return }
        }
        send { apiCall { repo.api.dispute(orderId, DisputeRequest(cat!!, s.comment.trim())) } }
    }

    private fun send(call: suspend () -> ApiResult<*>) {
        if (_state.value.sending) return
        _state.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            when (val r = call()) {
                is ApiResult.Success -> _state.update { it.copy(sending = false, done = true) }
                is ApiResult.Failure -> _state.update { it.copy(sending = false, error = r.error.toUiText()) }
            }
        }
    }
}

@Composable
fun RateScreen(orderId: String, onDone: () -> Unit) {
    val vm = containerViewModel(key = "rate-$orderId") { c -> FeedbackViewModel(c.repository, orderId) }
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.done) { if (state.done) onDone() }
    ScreenScaffold(title = stringResource(R.string.rate_title), onBack = onDone) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(stringResource(R.string.rate_question), style = MaterialTheme.typography.titleMedium)
            Row {
                for (n in 1..5) {
                    IconButton(onClick = { vm.setStars(n) }) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = stringResource(R.string.rate_star_desc, n),
                            tint = if (n <= state.stars) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                            modifier = Modifier.size(40.dp),
                        )
                    }
                }
            }
            OutlinedTextField(
                value = state.comment,
                onValueChange = vm::setComment,
                label = { Text(stringResource(R.string.rate_comment)) },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            ErrorCard(state.error)
            LoadingButton(stringResource(R.string.rate_submit), state.sending, vm::submitRating, Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun DisputeScreen(orderId: String, onDone: () -> Unit) {
    val vm = containerViewModel(key = "dispute-$orderId") { c -> FeedbackViewModel(c.repository, orderId) }
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.done) { if (state.done) onDone() }
    ScreenScaffold(title = stringResource(R.string.dispute_title), onBack = onDone) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.dispute_intro))
            for (c in state.categories) {
                Row(
                    Modifier.fillMaxWidth().selectable(selected = state.category == c, onClick = { vm.setCategory(c) }).padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = state.category == c, onClick = { vm.setCategory(c) })
                    Text(Labels.disputeCategory(c)?.let { stringResource(it) } ?: c)
                }
            }
            OutlinedTextField(
                value = state.comment,
                onValueChange = vm::setComment,
                label = { Text(stringResource(R.string.dispute_description)) },
                minLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )
            ErrorCard(state.error)
            LoadingButton(stringResource(R.string.dispute_submit), state.sending, vm::submitDispute, Modifier.fillMaxWidth())
        }
    }
}
