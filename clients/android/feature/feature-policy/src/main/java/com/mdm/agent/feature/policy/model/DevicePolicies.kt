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
