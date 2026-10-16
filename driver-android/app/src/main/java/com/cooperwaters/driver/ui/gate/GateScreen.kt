package com.cooperwaters.driver.ui.gate

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.cooperwaters.driver.R
import com.cooperwaters.driver.ui.common.appContainer
import com.cooperwaters.driver.ui.onboarding.DriverStage
import com.cooperwaters.driver.ui.onboarding.stageFor

/** Loads GET /driver/me (or the cached copy offline) and routes by account status. */
@Composable
fun GateScreen(onStage: (DriverStage) -> Unit) {
    val container = appContainer()
    var attempt by remember { mutableIntStateOf(0) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(attempt) {
        failed = false
        container.state.refreshConfig()
        val p = container.state.refreshProfile()
        if (p != null) {
            container.state.refreshActive()
            onStage(stageFor(p.status))
        } else {
            failed = true
        }
    }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        if (failed) {
            Text(stringResource(com.cooperwaters.core.R.string.cw_error_network))
            Button(onClick = { attempt++ }) { Text(stringResource(com.cooperwaters.core.R.string.cw_retry)) }
        } else {
            CircularProgressIndicator()
        }
    }
}
