package com.cooperwaters.core.android

import android.util.Log
import com.cooperwaters.core.util.CrashReporter

/** Debug-friendly default: logs to Logcat. Replace with a Sentry-backed implementation (see CrashReporter TODO). */
class LogcatCrashReporter(private val tag: String = "CooperWaters") : CrashReporter {
    override fun recordException(t: Throwable, context: Map<String, String>) {
        Log.e(tag, "error $context", t)
    }

    override fun breadcrumb(message: String) {
        Log.d(tag, message)
    }

    override fun setUser(userId: String?) {
        Log.d(tag, "user=$userId")
    }
}
