package com.mdm.agent.feature.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.UserManager
import com.mdm.agent.feature.policy.model.RestrictionPolicy
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RestrictionPolicyApplicator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    fun apply(policy: RestrictionPolicy) {
        Timber.d("Applying restriction policy")

        try {
            devicePolicyManager.setCameraDisabled(adminComponent, policy.cameraDisabled)
            devicePolicyManager.setScreenCaptureDisabled(adminComponent, policy.screenCaptureDisabled)

            setUserRestriction(UserManager.DISALLOW_USB_FILE_TRANSFER, policy.usbFileTransferDisabled)
            setUserRestriction(UserManager.DISALLOW_BLUETOOTH, policy.bluetoothDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_WIFI, policy.wifiConfigDisabled)
            setUserRestriction(UserManager.DISALLOW_INSTALL_APPS, policy.installAppsDisabled)
            setUserRestriction(UserManager.DISALLOW_UNINSTALL_APPS, policy.uninstallAppsDisabled)
            setUserRestriction(UserManager.DISALLOW_FACTORY_RESET, policy.factoryResetDisabled)
            setUserRestriction(UserManager.DISALLOW_DEBUGGING_FEATURES, policy.debuggingDisabled)
            setUserRestriction(UserManager.DISALLOW_SHARE_LOCATION, policy.locationSharingDisabled)

            Timber.d("Restriction policy applied successfully")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to apply restriction policy - not device owner?")
        }
    }

    private fun setUserRestriction(restriction: String, enabled: Boolean) {
        if (enabled) {
            devicePolicyManager.addUserRestriction(adminComponent, restriction)
        } else {
            devicePolicyManager.clearUserRestriction(adminComponent, restriction)
        }
    }
}
