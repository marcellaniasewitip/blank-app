package com.cooperwaters.core.android.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val WaterBlue = Color(0xFF0B6FB8)
private val DeepBlue = Color(0xFF07426E)
private val Aqua = Color(0xFF2BB3C0)
private val Warn = Color(0xFFB3261E)

private val Light = lightColorScheme(
    primary = WaterBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD3E7F8),
    onPrimaryContainer = DeepBlue,
    secondary = Aqua,
    onSecondary = Color.White,
    error = Warn,
)

private val Dark = darkColorScheme(
    primary = Color(0xFF9CCBF2),
    onPrimary = DeepBlue,
    primaryContainer = DeepBlue,
    onPrimaryContainer = Color(0xFFD3E7F8),
    secondary = Aqua,
)

@Composable
fun CooperWatersTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
