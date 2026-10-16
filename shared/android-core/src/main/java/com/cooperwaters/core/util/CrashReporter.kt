package com.cooperwaters.core.util

/**
 * Error-tracking hook (spec §12 observability). Both apps hold one instance in their AppContainer.
 *
 * TODO(sentry): add `io.sentry:sentry-android`, read the DSN from a Gradle property
 *  (e.g. `cw.sentryDsn`, never committed) into BuildConfig, and implement this interface with
 *  `Sentry.captureException` / `Sentry.addBreadcrumb` / `Sentry.setUser`. Until then the default is a no-op
 *  so the apps build without any keys.
 */
interface CrashReporter {
    fun recordException(t: Throwable, context: Map<String, String> = emptyMap())
    fun breadcrumb(message: String)
    fun setUser(userId: String?)

    object NoOp : CrashReporter {
        override fun recordException(t: Throwable, context: Map<String, String>) = Unit
        override fun breadcrumb(message: String) = Unit
        override fun setUser(userId: String?) = Unit
    }
}
