package com.mdm.agent.feature.remotecontrol

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.os.PowerManager
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceActionController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    fun lockDevice() {
        try {
            devicePolicyManager.lockNow()
            Timber.d("Device locked")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to lock device")
        }
    }

    fun rebootDevice() {
        try {
            devicePolicyManager.reboot(adminComponent)
            Timber.d("Device reboot initiated")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to reboot device")
        }
    }

    fun wipeDevice(flags: Int = 0) {
        try {
            devicePolicyManager.wipeData(flags)
            Timber.d("Device wipe initiated with flags: %d", flags)
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to wipe device")
        }
    }

    fun setVolume(streamType: Int, volume: Int) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.setStreamVolume(streamType, volume, 0)
        Timber.d("Volume set: stream=%d, volume=%d", streamType, volume)
    }

    fun setScreenBrightness(brightness: Int) {
        try {
            android.provider.Settings.System.putInt(
                context.contentResolver,
                android.provider.Settings.System.SCREEN_BRIGHTNESS,
                brightness.coerceIn(0, 255)
            )
            Timber.d("Screen brightness set to: %d", brightness)
        } catch (e: Exception) {
            Timber.e(e, "Failed to set screen brightness")
        }
    }

    fun clearAppData(packageName: String): Boolean {
        return try {
            devicePolicyManager.clearApplicationUserData(adminComponent, packageName, context.mainExecutor) { pkg, succeeded ->
                Timber.d("Clear app data for %s: %b", pkg, succeeded)
            }
            true
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to clear app data for %s", packageName)
            false
        }
    }
}
