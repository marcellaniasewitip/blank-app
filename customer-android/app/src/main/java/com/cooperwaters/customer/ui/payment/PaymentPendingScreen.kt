package com.cooperwaters.customer.ui.payment

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.cooperwaters.core.android.ui.ErrorCard
import com.cooperwaters.core.android.ui.LabelValue
import com.cooperwaters.core.android.ui.LoadingButton
import com.cooperwaters.core.android.ui.UiText
import com.cooperwaters.core.android.ui.rememberCountdown
import com.cooperwaters.core.android.ui.toUiText
import com.cooperwaters.core.money.Money
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.CancelRequest
import com.cooperwaters.core.net.Order
import com.cooperwaters.core.net.Payment
import com.cooperwaters.core.net.apiCall
import com.cooperwaters.core.order.OrderStatus
import com.cooperwaters.core.queue.QueueOutcome
import com.cooperwaters.core.realtime.RealtimeEvent
import com.cooperwaters.core.time.PomTime
import com.cooperwaters.customer.R
import com.cooperwaters.customer.data.CustomerRepository
import com.cooperwaters.customer.ui.common.ScreenScaffold
import com.cooperwaters.customer.ui.common.containerViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PaymentState(
    val order: Order? = null,
    val payment: Payment? = null,
    val msisdn: String = "",
    val starting: Boolean = false,
    val cancelling: Boolean = false,
    val error: UiText? = null,
) {
    val paid: Boolean get() = order != null && order.status != OrderStatus.PENDING_PAYMENT && order.status != OrderStatus.FAILED && order.status != OrderStatus.CANCELLED
    val closed: Boolean get() = order?.status == OrderStatus.FAILED || order?.status == OrderStatus.CANCELLED
    val canRetry: Boolean get() = order?.status == OrderStatus.PENDING_PAYMENT && (payment == null || !payment.isOpen)
}

/**
 * Cell money pending screen: shows the provider instructions and a countdown to `expiresAt`, polls
 * GET /customer/orders/{id}/payment every few seconds, and also reacts to `order.updated` from the socket.
 */
class PaymentViewModel(
    private val repo: CustomerRepository,
    private val orderId: String,
    accountPhone: String,
    realtime: Flow<RealtimeEvent>,
) : ViewModel() {
    private val _state = MutableStateFlow(PaymentState(msisdn = accountPhone))
    val state: StateFlow<PaymentState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repo.order(orderId).value?.let { o -> _state.update { it.copy(order = o) } }
            // Resume a payment start that never got an answer (same Idempotency-Key).
            repo.pendingPayment(orderId)?.let { submit(it) }
            while (true) {
                poll()
                if (_state.value.paid || _state.value.closed) break
                delay(POLL_MS)
            }
        }
        viewModelScope.launch {
            realtime.collect { e ->
                if (e is RealtimeEvent.OrderUpdated && e.order.id == orderId) {
                    _state.update { it.copy(order = it.order?.copy(status = e.order.status) ?: e.order) }
                    poll()
                }
            }
        }
    }

    private suspend fun poll() {
        val p = repo.payment(orderId)
        if (p is ApiResult.Success) _state.update { it.copy(payment = p.value) }
        val o = repo.order(orderId)
        if (!o.fromCache) o.value?.let { order -> _state.update { it.copy(order = order) } }
    }

    fun onMsisdn(v: String) = _state.update { it.copy(msisdn = v.filter { c -> c.isDigit() || c == '+' }.take(20)) }

    /** Start (again) the cell money collection. One tap = one Idempotency-Key, reused across retries. */
    fun retryPayment() {
        val s = _state.value
        if (s.starting) return
        if (s.msisdn.length < 7) {
            _state.update { it.copy(error = UiText.res(R.string.order_msisdn_invalid)) }
            return
        }
        viewModelScope.launch {
            val action = repo.pendingPayment(orderId) ?: repo.newPaymentAction(orderId, s.msisdn)
            submit(action)
        }
    }

    private suspend fun submit(action: com.cooperwaters.core.queue.PendingAction) {
        _state.update { it.copy(starting = true, error = null) }
        when (val out = repo.submitPayment(action)) {
            is QueueOutcome.Success -> _state.update { it.copy(starting = false, payment = out.value) }
            is QueueOutcome.Failed -> _state.update { it.copy(starting = false, error = out.error.toUiText()) }
            is QueueOutcome.StillPending -> _state.update { it.copy(starting = false, error = UiText.res(com.cooperwaters.core.R.string.cw_still_sending)) }
            else -> _state.update { it.copy(starting = false) }
        }
        poll()
    }

    fun cancel(reason: String) {
        if (_state.value.cancelling) return
        _state.update { it.copy(cancelling = true, error = null) }
        viewModelScope.launch {
            when (val r = apiCall { repo.api.cancel(orderId, CancelRequest(reason)) }) {
                is ApiResult.Success -> {
                    repo.cacheOrder(r.value)
                    _state.update { it.copy(cancelling = false, order = r.value) }
                }
                is ApiResult.Failure -> _state.update { it.copy(cancelling = false, error = r.error.toUiText()) }
            }
        }
    }

    private companion object {
        const val POLL_MS = 5_000L
    }
}

@Composable
fun PaymentPendingScreen(orderId: String, onBack: () -> Unit, onPaid: () -> Unit, onClosed: () -> Unit) {
    val vm = containerViewModel(key = "pay-$orderId") { c ->
        PaymentViewModel(c.repository, orderId, c.tokenStore.user()?.phone.orEmpty(), c.realtime.events)
    }
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.paid) { if (state.paid) onPaid() }
    val cancelReason = stringResource(R.string.payment_cancel_reason)

    ScreenScaffold(title = stringResource(R.string.payment_title), onBack = onBack) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val order = state.order
            val payment = state.payment
            if (order != null) {
                Text(order.shortCode, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            if (state.closed) {
                Text(stringResource(R.string.payment_failed_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
                payment?.failureReason?.let { Text(it) }
                OutlinedButton(onClick = onClosed, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.payment_view_order)) }
            } else {
                PaymentBody(state, vm, cancelReason)
            }
        }
    }
}

@Composable
private fun PaymentBody(state: PaymentState, vm: PaymentViewModel, cancelReason: String) {
    val order = state.order
    val payment = state.payment
    run {
            if (payment != null && payment.isOpen) {
                CircularProgressIndicator()
                Text(stringResource(R.string.payment_waiting), style = MaterialTheme.typography.titleMedium)
                val secs = rememberCountdown(payment.expiresAt)
                if (secs != null) {
                    Text(
                        stringResource(R.string.payment_expires_in, PomTime.formatCountdown(secs)),
                        style = MaterialTheme.typography.headlineSmall,
                        color = if (secs < 60) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            if (payment != null) {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        payment.instructions?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                        LabelValue(stringResource(R.string.payment_amount), Money.format(payment.amountToea))
                        if (payment.feeToea > 0) LabelValue(stringResource(R.string.payment_fee), Money.format(payment.feeToea))
                        LabelValue(stringResource(R.string.payment_reference), payment.reference)
                        if (!payment.isOpen) LabelValue(stringResource(R.string.payment_status), payment.status)
                        payment.failureReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
            ErrorCard(state.error)
            if (state.canRetry) {
                Text(stringResource(R.string.payment_retry_help))
                OutlinedTextField(
                    value = state.msisdn,
                    onValueChange = vm::onMsisdn,
                    label = { Text(stringResource(R.string.order_msisdn_label)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                LoadingButton(stringResource(R.string.payment_retry), state.starting, vm::retryPayment, Modifier.fillMaxWidth())
            }
            if (order?.status == OrderStatus.PENDING_PAYMENT) {
                LoadingButton(
                    text = stringResource(R.string.payment_cancel_order),
                    loading = state.cancelling,
                    onClick = { vm.cancel(cancelReason) },
                    modifier = Modifier.fillMaxWidth(),
                    outlined = true,
                )
            }
    }
}
