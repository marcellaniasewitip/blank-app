package com.cooperwaters.driver.ui.common

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.cooperwaters.core.android.ImageCompressor
import com.cooperwaters.core.android.PhotoFiles
import com.cooperwaters.driver.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** "Take photo" (system camera app) and "Choose from gallery" buttons. Returns the picked image Uri. */
@Composable
fun PhotoPickerButtons(onPicked: (Uri) -> Unit, enabled: Boolean = true, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var pendingCapture by rememberSaveable { mutableStateOf<String?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = pendingCapture
        if (ok && uri != null) onPicked(Uri.parse(uri))
        pendingCapture = null
    }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> if (uri != null) onPicked(uri) }
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(enabled = enabled, onClick = {
            val uri = PhotoFiles.newCaptureUri(context)
            pendingCapture = uri.toString()
            camera.launch(uri)
        }) { Text(stringResource(R.string.photo_take)) }
        OutlinedButton(enabled = enabled, onClick = { gallery.launch("image/*") }) { Text(stringResource(R.string.photo_gallery)) }
    }
}

/** Compress off the main thread (3G uploads). Null if the image could not be read. */
suspend fun compressPhoto(context: android.content.Context, uri: Uri): ByteArray? =
    withContext(Dispatchers.IO) { runCatching { ImageCompressor.compress(context, uri) }.getOrNull() }
