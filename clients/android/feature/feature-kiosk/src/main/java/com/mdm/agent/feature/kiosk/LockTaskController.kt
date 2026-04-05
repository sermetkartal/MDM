package com.mdm.agent.feature.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import com.mdm.agent.feature.kiosk.model.KioskConfiguration
import com.mdm.agent.feature.kiosk.model.KioskMode
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LockTaskController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    fun setLockTaskPackages(packages: Array<String>) {
        try {
            devicePolicyManager.setLockTaskPackages(adminComponent, packages)
            Timber.d("Set lock task packages: %s", packages.joinToString())
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set lock task packages - not device owner?")
        }
    }

    fun setLockTaskFeatures(config: KioskConfiguration) {
        try {
            val features = computeLockTaskFeatures(config)
            devicePolicyManager.setLockTaskFeatures(adminComponent, features)
            Timber.d("Set lock task features: 0x%08x", features)
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set lock task features")
        }
    }

    private fun computeLockTaskFeatures(config: KioskConfiguration): Int {
        // Single-app mode: total lockdown
        if (config.mode == KioskMode.SINGLE_APP) {
            return DevicePolicyManager.LOCK_TASK_FEATURE_NONE
        }

        var features = DevicePolicyManager.LOCK_TASK_FEATURE_NONE

        // Multi-app mode needs HOME to show the launcher grid
        if (config.mode == KioskMode.MULTI_APP) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_HOME
        }

        if (config.enableSystemInfo) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
        }
        if (config.enableNotifications) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
        }
        if (config.enableHomeButton) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_HOME
        }
        if (config.enableRecentsButton) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_OVERVIEW
        }
        if (config.enableGlobalActions) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
        }
        if (config.enableKeyguard) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD
        }

        return features
    }

    fun enterLockTaskMode(packages: List<String>, config: KioskConfiguration) {
        try {
            setLockTaskPackages(packages.toTypedArray())
            setLockTaskFeatures(config)
            disableKeyguard()
            disableStatusBar(config)
            configureScreenTimeout(config)
            configureStayOnWhilePluggedIn(config)
            Timber.d("Lock task mode configuration applied")
        } catch (e: Exception) {
            Timber.e(e, "Failed to configure lock task mode")
        }
    }

    fun startLockTaskFromActivity(activity: Activity) {
        try {
            activity.startLockTask()
            Timber.d("Lock task started from activity")
        } catch (e: Exception) {
            Timber.e(e, "Failed to start lock task from activity")
        }
    }

    fun stopLockTaskFromActivity(activity: Activity) {
        try {
            activity.stopLockTask()
            Timber.d("Lock task stopped from activity")
        } catch (e: Exception) {
            Timber.e(e, "Failed to stop lock task from activity")
        }
    }

    fun startLockTask() {
        Timber.d("Lock task mode start requested (must be called from Activity)")
    }

    fun stopLockTask() {
        try {
            restoreKeyguard()
            restoreStatusBar()
            restoreScreenTimeout()
            devicePolicyManager.setLockTaskPackages(adminComponent, emptyArray())
            Timber.d("Lock task mode stopped and packages cleared")
        } catch (e: Exception) {
            Timber.e(e, "Failed to stop lock task mode")
        }
    }

    fun isInLockTaskMode(): Boolean {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    fun getLockTaskPackages(): Array<String> {
        return try {
            devicePolicyManager.getLockTaskPackages(adminComponent)
        } catch (e: SecurityException) {
            Timber.w(e, "Failed to get lock task packages")
            emptyArray()
        }
    }

    private fun disableKeyguard() {
        try {
            devicePolicyManager.setKeyguardDisabled(adminComponent, true)
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to disable keyguard")
        }
    }

    private fun restoreKeyguard() {
        try {
            devicePolicyManager.setKeyguardDisabled(adminComponent, false)
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to restore keyguard")
        }
    }

    private fun disableStatusBar(config: KioskConfiguration) {
        if (!config.enableStatusBar) {
            try {
                devicePolicyManager.setStatusBarDisabled(adminComponent, true)
            } catch (e: SecurityException) {
                Timber.e(e, "Failed to disable status bar")
            }
        }
    }

    private fun restoreStatusBar() {
        try {
            devicePolicyManager.setStatusBarDisabled(adminComponent, false)
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to restore status bar")
        }
    }

    private fun configureScreenTimeout(config: KioskConfiguration) {
        try {
            if (config.screenTimeoutMs == 0L) {
                // Disable screen timeout
                devicePolicyManager.setGlobalSetting(
                    adminComponent,
                    Settings.Global.SCREEN_OFF_TIMEOUT,
                    Integer.MAX_VALUE.toString()
                )
            } else if (config.screenTimeoutMs > 0) {
                devicePolicyManager.setGlobalSetting(
                    adminComponent,
                    Settings.Global.SCREEN_OFF_TIMEOUT,
                    config.screenTimeoutMs.toString()
                )
            }
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set screen timeout")
        }
    }

    private fun restoreScreenTimeout() {
        try {
            devicePolicyManager.setGlobalSetting(
                adminComponent,
                Settings.Global.SCREEN_OFF_TIMEOUT,
                "60000" // Default 1 minute
            )
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to restore screen timeout")
        }
    }

    private fun configureStayOnWhilePluggedIn(config: KioskConfiguration) {
        if (config.stayOnWhilePluggedIn) {
            try {
                devicePolicyManager.setGlobalSetting(
                    adminComponent,
                    Settings.Global.STAY_ON_WHILE_PLUGGED_IN,
                    (android.os.BatteryManager.BATTERY_PLUGGED_AC or
                            android.os.BatteryManager.BATTERY_PLUGGED_USB or
                            android.os.BatteryManager.BATTERY_PLUGGED_WIRELESS).toString()
                )
            } catch (e: SecurityException) {
                Timber.e(e, "Failed to set stay on while plugged in")
            }
        }
    }
}
