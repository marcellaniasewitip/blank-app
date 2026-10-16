package com.cooperwaters.driver.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.cooperwaters.core.android.ui.ErrorCard
import com.cooperwaters.core.android.ui.LoadingButton
import com.cooperwaters.core.android.ui.SectionTitle
import com.cooperwaters.driver.R
import com.cooperwaters.driver.ui.common.PhotoPickerButtons
import com.cooperwaters.driver.ui.common.ScreenScaffold
import com.cooperwaters.driver.ui.common.appContainer
import com.cooperwaters.driver.ui.common.compressPhoto
import com.cooperwaters.driver.ui.common.containerViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

fun documentLabel(type: String): Int = when (type) {
    "drivers_licence" -> R.string.doc_drivers_licence
    "vehicle_registration" -> R.string.doc_vehicle_registration
    "national_id" -> R.string.doc_national_id
    "truck_photo" -> R.string.doc_truck_photo
    else -> R.string.doc_other
}

fun documentStatusLabel(status: String): Int = when (status) {
    "approved" -> R.string.doc_status_approved
    "pending" -> R.string.doc_status_pending
    "rejected" -> R.string.doc_status_rejected
    else -> R.string.doc_status_missing
}

/** Upload documents (camera or gallery per required type) + truck registration. */
@Composable
fun OnboardingScreen(onStageChanged: (DriverStage) -> Unit, onProfile: () -> Unit) {
    val vm = containerViewModel { c -> OnboardingViewModel(c.repository, c.uploader, c.state) }
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(state.stage) { state.stage?.takeIf { it != DriverStage.ONBOARDING }?.let(onStageChanged) }

    ScreenScaffold(
        title = stringResource(R.string.onboarding_title),
        actions = {
            IconButton(onClick = vm::refresh) { Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.action_refresh)) }
            IconButton(onClick = onProfile) { Icon(androidx.compose.material.icons.Icons.Filled.AccountCircle, contentDescription = stringResource(R.string.profile_title)) }
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.onboarding_intro))
            state.profile?.rejectReason?.takeIf { state.profile?.status == "rejected" }?.let {
                ErrorCard(com.cooperwaters.core.android.ui.UiText.Res(R.string.onboarding_rejected, listOf(it)))
            }
            ErrorCard(state.error, onDismiss = null)
            SectionTitle(stringResource(R.string.onboarding_documents))
            for (doc in state.documents) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(stringResource(documentLabel(doc.type)), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            AssistChip(onClick = {}, label = { Text(stringResource(documentStatusLabel(doc.status))) })
                        }
                        doc.notes?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                        if (state.uploading == doc.type) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(Modifier.padding(end = 8.dp))
                                Text(stringResource(R.string.onboarding_uploading))
                            }
                        } else if (doc.status != "approved") {
                            PhotoPickerButtons(
                                enabled = state.uploading == null,
                                onPicked = { uri ->
                                    scope.launch {
                                        val bytes = compressPhoto(context, uri)
                                        if (bytes != null) vm.uploadDocument(doc.type, bytes)
                                    }
                                },
                            )
                        }
                    }
                }
            }
            SectionTitle(stringResource(R.string.truck_title))
            OutlinedTextField(state.plate, vm::onPlate, label = { Text(stringResource(R.string.truck_plate)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                state.capacity,
                vm::onCapacity,
                label = { Text(stringResource(R.string.truck_capacity)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(stringResource(if (state.truckPhotoBytes != null) R.string.truck_photo_ready else R.string.truck_photo_optional), style = MaterialTheme.typography.bodySmall)
            PhotoPickerButtons(onPicked = { uri -> scope.launch { compressPhoto(context, uri)?.let(vm::onTruckPhoto) } })
            LoadingButton(
                stringResource(if (state.truckSaved) R.string.truck_saved else R.string.truck_save),
                state.savingTruck,
                vm::saveTruck,
                Modifier.fillMaxWidth(),
                enabled = !state.truckSaved,
            )
        }
    }
}

/** Shown while an admin reviews the documents (or the account is suspended). Polls GET /driver/me. */
@Composable
fun WaitingScreen(onStageChanged: (DriverStage) -> Unit, onProfile: () -> Unit) {
    val container = appContainer()
    val profile by container.state.profile.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        while (true) {
            container.state.refreshProfile()
            delay(30_000)
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { scope.launch { container.state.refreshProfile() } }
    LaunchedEffect(profile?.status) { profile?.let { p -> stageFor(p.status).takeIf { it != DriverStage.WAITING }?.let(onStageChanged) } }

    ScreenScaffold(title = stringResource(R.string.waiting_title), actions = {
        IconButton(onClick = onProfile) { Icon(androidx.compose.material.icons.Icons.Filled.AccountCircle, contentDescription = stringResource(R.string.profile_title)) }
    }) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val suspended = profile?.status == "suspended"
            Text(
                stringResource(if (suspended) R.string.waiting_suspended_title else R.string.waiting_review_title),
                style = MaterialTheme.typography.headlineSmall,
            )
            Text(stringResource(if (suspended) R.string.waiting_suspended_body else R.string.waiting_review_body))
            if (!suspended) CircularProgressIndicator()
            profile?.documents?.forEach { d ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(documentLabel(d.type)))
                    Text(stringResource(documentStatusLabel(d.status)))
                }
            }
            profile?.truck?.let { Text(stringResource(R.string.waiting_truck, it.plate, it.capacityLitres)) }
            OutlinedButton(onClick = { scope.launch { container.state.refreshProfile() } }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.waiting_check_now))
            }
        }
    }
}
