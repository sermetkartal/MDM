package com.mdm.agent.feature.policy.model

data class DevicePolicies(
    val version: Long,
    val passwordPolicy: PasswordPolicy? = null,
    val restrictionPolicy: RestrictionPolicy? = null,
    val networkPolicy: NetworkPolicy? = null,
)

data class PasswordPolicy(
    val quality: PasswordQuality = PasswordQuality.UNSPECIFIED,
    val minimumLength: Int = 0,
    val minimumUpperCase: Int = 0,
    val minimumLowerCase: Int = 0,
    val minimumNumeric: Int = 0,
    val minimumSymbols: Int = 0,
    val maximumFailedAttempts: Int = 10,
    val expirationTimeoutMs: Long = 0,
    val historyLength: Int = 0,
)

enum class PasswordQuality {
    UNSPECIFIED,
    BIOMETRIC_WEAK,
    SOMETHING,
    NUMERIC,
    NUMERIC_COMPLEX,
    ALPHABETIC,
    ALPHANUMERIC,
    COMPLEX,
}

data class RestrictionPolicy(
    // Core restrictions
    val cameraDisabled: Boolean = false,
    val screenCaptureDisabled: Boolean = false,
    val usbFileTransferDisabled: Boolean = false,
    val bluetoothDisabled: Boolean = false,
    val wifiConfigDisabled: Boolean = false,
    val installAppsDisabled: Boolean = false,
    val uninstallAppsDisabled: Boolean = false,
    val factoryResetDisabled: Boolean = false,
    val debuggingDisabled: Boolean = false,
    val locationSharingDisabled: Boolean = false,
    val clipboardDisabled: Boolean = false,

    // User & Account
    val addManagedProfileDisabled: Boolean = false,
    val addUserDisabled: Boolean = false,
    val removeManagedProfileDisabled: Boolean = false,
    val removeUserDisabled: Boolean = false,
    val userSwitchDisabled: Boolean = false,
    val modifyAccountsDisabled: Boolean = false,
    val outgoingCallsDisabled: Boolean = false,
    val smsDisabled: Boolean = false,

    // Configuration & Settings
    val adjustVolumeDisabled: Boolean = false,
    val configBrightnessDisabled: Boolean = false,
    val configCellBroadcastsDisabled: Boolean = false,
    val configCredentialsDisabled: Boolean = false,
    val configDateTimeDisabled: Boolean = false,
    val configDefaultAppsDisabled: Boolean = false,
    val configLocaleDisabled: Boolean = false,
    val configLocationDisabled: Boolean = false,
    val configMobileNetworksDisabled: Boolean = false,
    val configPrivateDnsDisabled: Boolean = false,
    val configScreenTimeoutDisabled: Boolean = false,
    val configTetheringDisabled: Boolean = false,
    val configVpnDisabled: Boolean = false,

    // Hardware & Physical
    val mountPhysicalMediaDisabled: Boolean = false,
    val nfcDisabled: Boolean = false,
    val outgoingBeamDisabled: Boolean = false,
    val wifiDirectDisabled: Boolean = false,
    val wifiTetheringDisabled: Boolean = false,
    val safeBootDisabled: Boolean = false,
    val printingDisabled: Boolean = false,

    // Security & Protection
    val networkResetDisabled: Boolean = false,
    val systemErrorDialogsDisabled: Boolean = false,
    val unifiedPasswordDisabled: Boolean = false,
    val contentCaptureDisabled: Boolean = false,
    val contentSuggestionsDisabled: Boolean = false,
    val installUnknownSourcesDisabled: Boolean = false,
    val installUnknownSourcesGloballyDisabled: Boolean = false,

    // Apps & Data
    val appsControlDisabled: Boolean = false,
    val grantAdminDisabled: Boolean = false,
    val createWindowsDisabled: Boolean = false,
    val crossProfileCopyPasteDisabled: Boolean = false,
    val shareIntoManagedProfileDisabled: Boolean = false,
    val autofillDisabled: Boolean = false,

    // Other
    val ambientDisplayDisabled: Boolean = false,
    val funDisabled: Boolean = false,
    val dataRoamingDisabled: Boolean = false,
    val microphoneToggleDisabled: Boolean = false,
    val bluetoothSharingDisabled: Boolean = false,

    // DPM Direct Methods
    val usbDataSignalingDisabled: Boolean = false,
    val statusBarDisabled: Boolean = false,
    val keyguardDisabled: Boolean = false,
    val autoTimeRequired: Boolean = false,
)

data class NetworkPolicy(
    val vpnAlwaysOn: Boolean = false,
    val vpnPackage: String? = null,
    val vpnLockdown: Boolean = false,
    val allowedWifiSsids: List<String> = emptyList(),
    val globalProxy: ProxyConfig? = null,
)

data class ProxyConfig(
    val host: String,
    val port: Int,
    val exclusionList: List<String> = emptyList(),
)
