package com.mdm.agent.feature.kiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import com.mdm.agent.feature.kiosk.model.PeripheralPolicy
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PeripheralPolicyManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    fun applyPolicy(policy: PeripheralPolicy) {
        Timber.d("Applying peripheral policy: %s", policy)
        setCameraEnabled(policy.cameraEnabled)
        setUsbEnabled(policy.usbEnabled)
        setBluetoothEnabled(policy.bluetoothEnabled)
        setNfcEnabled(policy.nfcEnabled)
        setWifiConfigEnabled(policy.wifiConfigEnabled)
    }

    fun setCameraEnabled(enabled: Boolean) {
        try {
            devicePolicyManager.setCameraDisabled(adminComponent, !enabled)
            Timber.d("Camera %s", if (enabled) "enabled" else "disabled")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set camera policy")
        }
    }

    fun setUsbEnabled(enabled: Boolean) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                devicePolicyManager.setUsbDataSignalingEnabled(enabled)
                Timber.d("USB data signaling %s", if (enabled) "enabled" else "disabled")
            } else {
                // Fallback for pre-API 31: use user restriction
                if (!enabled) {
                    devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)
                } else {
                    devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)
                }
                Timber.d("USB file transfer %s (pre-S fallback)", if (enabled) "enabled" else "disabled")
            }
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set USB policy")
        }
    }

    fun setBluetoothEnabled(enabled: Boolean) {
        try {
            if (!enabled) {
                devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_BLUETOOTH)
                devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_BLUETOOTH_SHARING)
            } else {
                devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_BLUETOOTH)
                devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_BLUETOOTH_SHARING)
            }
            Timber.d("Bluetooth %s", if (enabled) "enabled" else "disabled")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set Bluetooth policy")
        }
    }

    fun setNfcEnabled(enabled: Boolean) {
        try {
            if (!enabled) {
                devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_OUTGOING_BEAM)
            } else {
                devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_OUTGOING_BEAM)
            }
            Timber.d("NFC beam %s", if (enabled) "enabled" else "disabled")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set NFC policy")
        }
    }

    fun setWifiConfigEnabled(enabled: Boolean) {
        try {
            if (!enabled) {
                devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_WIFI)
            } else {
                devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_WIFI)
            }
            Timber.d("WiFi config %s", if (enabled) "enabled" else "disabled")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set WiFi config policy")
        }
    }

    fun clearAllRestrictions() {
        try {
            devicePolicyManager.setCameraDisabled(adminComponent, false)
            devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)
            devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_BLUETOOTH)
            devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_BLUETOOTH_SHARING)
            devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_OUTGOING_BEAM)
            devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_WIFI)
            Timber.d("All peripheral restrictions cleared")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to clear peripheral restrictions")
        }
    }
}
