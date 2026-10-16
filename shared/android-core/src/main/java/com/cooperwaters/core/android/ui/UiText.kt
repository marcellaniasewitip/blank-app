package com.cooperwaters.core.android.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.cooperwaters.core.R
import com.cooperwaters.core.net.ApiError
import com.cooperwaters.core.net.ErrorCodes

/** Text for the UI without a Context in ViewModels: a string resource, or server-provided text shown as-is. */
sealed interface UiText {
    data class Res(@StringRes val id: Int, val args: List<Any> = emptyList()) : UiText
    data class Raw(val text: String) : UiText

    @Composable
    fun asString(): String = when (this) {
        is Res -> if (args.isEmpty()) stringResource(id) else stringResource(id, *args.toTypedArray())
        is Raw -> text
    }

    companion object {
        fun res(@StringRes id: Int, vararg args: Any): UiText = Res(id, args.toList())
    }
}

/** Server message when there is one (already user-facing English), otherwise a localised fallback. */
fun ApiError.toUiText(): UiText = when {
    isNetwork -> UiText.Res(R.string.cw_error_network)
    code == ErrorCodes.RATE_LIMITED && message == null -> UiText.Res(R.string.cw_error_rate_limited)
    !message.isNullOrBlank() -> UiText.Raw(message)
    kind == ApiError.Kind.PARSE -> UiText.Res(R.string.cw_error_unexpected)
    else -> UiText.Res(R.string.cw_error_generic)
}
