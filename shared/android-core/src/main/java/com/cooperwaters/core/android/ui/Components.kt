package com.cooperwaters.core.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cooperwaters.core.R
import com.cooperwaters.core.time.PomTime
import kotlinx.coroutines.delay

/** Shown at the top of screens while the device is offline. */
@Composable
fun OfflineBanner(offline: Boolean, modifier: Modifier = Modifier, pendingCount: Int = 0) {
    if (!offline && pendingCount == 0) return
    Box(
        modifier
            .fillMaxWidth()
            .background(if (offline) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        val text = when {
            offline && pendingCount > 0 -> stringResource(R.string.cw_offline_with_pending, pendingCount)
            offline -> stringResource(R.string.cw_offline)
            else -> stringResource(R.string.cw_sending_pending, pendingCount)
        }
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

/** Error message card with an optional retry. */
@Composable
fun ErrorCard(message: UiText?, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null, onDismiss: (() -> Unit)? = null) {
    if (message == null) return
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(message.asString(), color = MaterialTheme.colorScheme.onErrorContainer)
            if (onRetry != null || onDismiss != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    if (onDismiss != null) TextButton(onClick = onDismiss) { Text(stringResource(R.string.cw_dismiss)) }
                    if (onRetry != null) TextButton(onClick = onRetry) { Text(stringResource(R.string.cw_retry)) }
                }
            }
        }
    }
}

/** Primary button that shows a spinner and is disabled while [loading] (prevents double taps). */
@Composable
fun LoadingButton(
    text: String,
    loading: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    outlined: Boolean = false,
) {
    val content: @Composable () -> Unit = {
        if (loading) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            Spacer(Modifier.width(8.dp))
        }
        Text(text)
    }
    if (outlined) {
        OutlinedButton(onClick = onClick, enabled = enabled && !loading, modifier = modifier) { content() }
    } else {
        Button(onClick = onClick, enabled = enabled && !loading, modifier = modifier) { content() }
    }
}

@Composable
fun FullScreenLoading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = modifier.padding(vertical = 8.dp))
}

@Composable
fun LabelValue(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

/** Seconds remaining until [expiresAtIso], ticking every second. */
@Composable
fun rememberCountdown(expiresAtIso: String?): Long? {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(expiresAtIso) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    return PomTime.secondsUntil(expiresAtIso, java.time.Instant.ofEpochMilli(now))
}

@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
