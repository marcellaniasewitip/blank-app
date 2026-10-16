package com.cooperwaters.core.android

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Firebase is OPTIONAL: without google-services.json the Gradle plugin isn't applied, FirebaseApp never
 * initialises, and push is simply skipped (the Socket.IO channel still works).
 */
object PushSupport {
    fun isAvailable(context: Context): Boolean = try {
        FirebaseApp.getApps(context).isNotEmpty()
    } catch (e: Throwable) {
        false
    }

    /** Fetch the FCM token and hand it to [onToken] (e.g. PUT /{app}/me/push-token). No-op without Firebase. */
    fun fetchToken(context: Context, onToken: (String) -> Unit) {
        if (!isAvailable(context)) return
        try {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> if (!token.isNullOrBlank()) onToken(token) }
        } catch (e: Throwable) {
            // Firebase misconfigured — ignore, realtime socket remains.
        }
    }

    fun deleteToken(context: Context) {
        if (!isAvailable(context)) return
        try {
            FirebaseMessaging.getInstance().deleteToken()
        } catch (e: Throwable) {
            // ignore
        }
    }
}
