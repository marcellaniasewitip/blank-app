package com.cooperwaters.customer.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cooperwaters.core.android.ui.Labels
import com.cooperwaters.core.money.Money
import com.cooperwaters.core.net.Order
import com.cooperwaters.core.time.PomTime
import com.cooperwaters.customer.R

@Composable
fun OrderCard(order: Order, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(order.shortCode, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                AssistChip(onClick = onClick, label = { Text(stringResource(Labels.status(order.status))) })
            }
            Text(
                stringResource(R.string.order_summary_line, order.quantity, order.`package`?.name.orEmpty(), Money.format(order.priceToea)),
                style = MaterialTheme.typography.bodyMedium,
            )
            order.delivery?.let { Text(it.address, style = MaterialTheme.typography.bodySmall) }
            Text(PomTime.formatDateTime(order.timeline.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
