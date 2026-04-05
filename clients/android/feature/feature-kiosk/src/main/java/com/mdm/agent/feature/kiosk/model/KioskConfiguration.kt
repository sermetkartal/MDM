package com.mdm.agent.feature.kiosk.model

import kotlinx.serialization.Serializable

@Serializable
data class KioskConfiguration(
    val mode: KioskMode = KioskMode.SINGLE_APP,
    val allowedPackages: List<String> = emptyList(),
    val targetPackage: String? = null,
    val enableStatusBar: Boolean = false,
    val enableNavigationBar: Boolean = false,
    val enableNotifications: Boolean = false,
    val enableSystemInfo: Boolean = false,
    val enableHomeButton: Boolean = false,
    val enableRecentsButton: Boolean = false,
    val enableGlobalActions: Boolean = false,
    val enableKeyguard: Boolean = false,
    val autoRestartOnCrash: Boolean = true,
    val watchdogEnabled: Boolean = true,
    val adminEscapePin: String = "",
    val brandingLogoUrl: String? = null,
    val brandingBackgroundColor: String? = null,
    val brandingMessage: String? = null,
    val signageUrl: String? = null,
    val signageRefreshIntervalMs: Long = 0,
    val signagePlaylist: List<SignageItem> = emptyList(),
    val webKioskUrl: String? = null,
    val webKioskUrlWhitelist: List<String> = emptyList(),
    val webKioskShowNavBar: Boolean = false,
    val webKioskAutoRefreshIntervalMs: Long = 0,
    val screenTimeoutMs: Long = 0,
    val stayOnWhilePluggedIn: Boolean = true,
    val screenBrightness: Int = -1,
    val peripheralPolicy: PeripheralPolicy = PeripheralPolicy(),
)

@Serializable
enum class KioskMode {
    SINGLE_APP,
    MULTI_APP,
    WEB_KIOSK,
    DIGITAL_SIGNAGE,
    ASSESSMENT,
}

@Serializable
data class PeripheralPolicy(
    val usbEnabled: Boolean = false,
    val bluetoothEnabled: Boolean = false,
    val cameraEnabled: Boolean = false,
    val microphoneEnabled: Boolean = false,
    val nfcEnabled: Boolean = false,
    val wifiConfigEnabled: Boolean = true,
)

@Serializable
data class SignageItem(
    val type: SignageItemType,
    val url: String,
    val durationMs: Long = 10_000L,
    val audioEnabled: Boolean = false,
    val transitionEffect: TransitionEffect = TransitionEffect.CROSSFADE,
)

@Serializable
enum class SignageItemType {
    IMAGE,
    VIDEO,
    WEB,
    HTML,
}

@Serializable
enum class TransitionEffect {
    NONE,
    CROSSFADE,
    SLIDE_LEFT,
    SLIDE_RIGHT,
}
