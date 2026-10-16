package com.cooperwaters.core.android

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/** Temp files the camera app writes into (shared via the core FileProvider declared in the core manifest). */
object PhotoFiles {
    fun newCaptureUri(context: Context): Uri {
        val dir = File(context.cacheDir, "photos").apply { mkdirs() }
        // Keep the folder small: drop captures older than a day.
        dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000L }?.forEach { it.delete() }
        val file = File.createTempFile("cw_", ".jpg", dir)
        return FileProvider.getUriForFile(context, context.packageName + ".cwfileprovider", file)
    }
}
