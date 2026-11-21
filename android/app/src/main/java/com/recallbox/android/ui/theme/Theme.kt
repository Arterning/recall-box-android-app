package com.recallbox.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF30352A),
    onPrimary = Color(0xFFF5F4EB),
    primaryContainer = Color(0xFFE7EBE1),
    onPrimaryContainer = Color(0xFF46513E),
    secondary = Color(0xFF667858),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFFF4F4EF),
    onBackground = Color(0xFF262920),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF262920),
    surfaceVariant = Color(0xFFFBFBF8),
    onSurfaceVariant = Color(0xFF74796D),
    outline = Color(0xFFE5E6DF)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA9C393),
    onPrimary = Color(0xFF171A16),
    primaryContainer = Color(0xFF343C2F),
    onPrimaryContainer = Color(0xFFD5E6C7),
    secondary = Color(0xFF8FA17D),
    onSecondary = Color(0xFF171A16),
    background = Color(0xFF171A16),
    onBackground = Color(0xFFE0E3D9),
    surface = Color(0xFF22251F),
    onSurface = Color(0xFFE0E3D9),
    surfaceVariant = Color(0xFF1D201B),
    onSurfaceVariant = Color(0xFF9BA095),
    outline = Color(0xFF383D34)
)

@Composable
fun RecallBoxTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content
    )
}
