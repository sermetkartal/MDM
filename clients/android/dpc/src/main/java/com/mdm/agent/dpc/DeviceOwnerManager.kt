package com.mdm.agent.dpc

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceOwnerManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = MdmDeviceAdminReceiver.getComponentName(context)

    fun isDeviceOwner(): Boolean {
        return devicePolicyManager.isDeviceOwnerApp(context.packageName)
    }

    fun isProfileOwner(): Boolean {
        return devicePolicyManager.isProfileOwnerApp(context.packageName)
    }

    fun getOperatingMode(): OperatingMode {
        return when {
            isDeviceOwner() -> OperatingMode.DEVICE_OWNER
            isProfileOwner() -> OperatingMode.PROFILE_OWNER
            devicePolicyManager.isAdminActive(adminComponent) -> OperatingMode.DEVICE_ADMIN
            else -> OperatingMode.NONE
        }
    }

    fun getDeviceInfo(): DeviceInfo {
        return DeviceInfo(
            manufacturer = Build.MANUFACTURER,
            model = Build.MODEL,
            device = Build.DEVICE,
            sdkVersion = Build.VERSION.SDK_INT,
            release = Build.VERSION.RELEASE,
            securityPatch = Build.VERSION.SECURITY_PATCH,
            serial = try { Build.getSerial() } catch (e: SecurityException) { "unknown" },
            buildId = Build.ID,
            operatingMode = getOperatingMode(),
        )
    }

    fun setSecurityLoggingEnabled(enabled: Boolean) {
        try {
            devicePolicyManager.setSecurityLoggingEnabled(adminComponent, enabled)
            Timber.d("Security logging %s", if (enabled) "enabled" else "disabled")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set security logging")
        }
    }

    fun setNetworkLoggingEnabled(enabled: Boolean) {
        try {
            devicePolicyManager.setNetworkLoggingEnabled(adminComponent, enabled)
            Timber.d("Network logging %s", if (enabled) "enabled" else "disabled")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set network logging")
        }
    }

    fun setBackupServiceEnabled(enabled: Boolean) {
        try {
            devicePolicyManager.setBackupServiceEnabled(adminComponent, enabled)
            Timber.d("Backup service %s", if (enabled) "enabled" else "disabled")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set backup service")
        }
    }

    enum class OperatingMode {
        DEVICE_OWNER,
        PROFILE_OWNER,
        DEVICE_ADMIN,
        NONE,
    }

    data class DeviceInfo(
        val manufacturer: String,
        val model: String,
        val device: String,
        val sdkVersion: Int,
        val release: String,
        val securityPatch: String,
        val serial: String,
        val buildId: String,
        val operatingMode: OperatingMode,
    )
}
