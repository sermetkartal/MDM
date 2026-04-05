package com.mdm.agent.feature.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
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
            // Core restrictions
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
            setUserRestriction(UserManager.DISALLOW_CROSS_PROFILE_COPY_PASTE, policy.clipboardDisabled)

            // User & Account
            setUserRestriction(UserManager.DISALLOW_ADD_MANAGED_PROFILE, policy.addManagedProfileDisabled)
            setUserRestriction(UserManager.DISALLOW_ADD_USER, policy.addUserDisabled)
            setUserRestriction(UserManager.DISALLOW_REMOVE_MANAGED_PROFILE, policy.removeManagedProfileDisabled)
            setUserRestriction(UserManager.DISALLOW_REMOVE_USER, policy.removeUserDisabled)
            setUserRestriction(UserManager.DISALLOW_USER_SWITCH, policy.userSwitchDisabled)
            setUserRestriction(UserManager.DISALLOW_MODIFY_ACCOUNTS, policy.modifyAccountsDisabled)
            setUserRestriction(UserManager.DISALLOW_OUTGOING_CALLS, policy.outgoingCallsDisabled)
            setUserRestriction(UserManager.DISALLOW_SMS, policy.smsDisabled)

            // Configuration & Settings
            setUserRestriction(UserManager.DISALLOW_ADJUST_VOLUME, policy.adjustVolumeDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_BRIGHTNESS, policy.configBrightnessDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_CELL_BROADCASTS, policy.configCellBroadcastsDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_CREDENTIALS, policy.configCredentialsDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_DATE_TIME, policy.configDateTimeDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_DEFAULT_APPS, policy.configDefaultAppsDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_LOCALE, policy.configLocaleDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_LOCATION, policy.configLocationDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS, policy.configMobileNetworksDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_PRIVATE_DNS, policy.configPrivateDnsDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_SCREEN_TIMEOUT, policy.configScreenTimeoutDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_TETHERING, policy.configTetheringDisabled)
            setUserRestriction(UserManager.DISALLOW_CONFIG_VPN, policy.configVpnDisabled)

            // Hardware & Physical
            setUserRestriction(UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA, policy.mountPhysicalMediaDisabled)
            setUserRestriction(UserManager.DISALLOW_OUTGOING_BEAM, policy.nfcDisabled)
            setUserRestriction(UserManager.DISALLOW_OUTGOING_BEAM, policy.outgoingBeamDisabled)
            setUserRestriction(UserManager.DISALLOW_WIFI_DIRECT, policy.wifiDirectDisabled)
            setUserRestriction(UserManager.DISALLOW_WIFI_TETHERING, policy.wifiTetheringDisabled)
            setUserRestriction(UserManager.DISALLOW_SAFE_BOOT, policy.safeBootDisabled)
            setUserRestriction(UserManager.DISALLOW_PRINTING, policy.printingDisabled)

            // Security & Protection
            setUserRestriction(UserManager.DISALLOW_NETWORK_RESET, policy.networkResetDisabled)
            setUserRestriction(UserManager.DISALLOW_SYSTEM_ERROR_DIALOGS, policy.systemErrorDialogsDisabled)
            setUserRestriction(UserManager.DISALLOW_UNIFIED_PASSWORD, policy.unifiedPasswordDisabled)
            setUserRestriction(UserManager.DISALLOW_CONTENT_CAPTURE, policy.contentCaptureDisabled)
            setUserRestriction(UserManager.DISALLOW_CONTENT_SUGGESTIONS, policy.contentSuggestionsDisabled)
            setUserRestriction(UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES, policy.installUnknownSourcesDisabled)
            setUserRestriction(UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES_GLOBALLY, policy.installUnknownSourcesGloballyDisabled)

            // Apps & Data
            setUserRestriction(UserManager.DISALLOW_APPS_CONTROL, policy.appsControlDisabled)
            setUserRestriction(UserManager.DISALLOW_GRANT_ADMIN, policy.grantAdminDisabled)
            setUserRestriction(UserManager.DISALLOW_CREATE_WINDOWS, policy.createWindowsDisabled)
            setUserRestriction(UserManager.DISALLOW_CROSS_PROFILE_COPY_PASTE, policy.crossProfileCopyPasteDisabled)
            setUserRestriction(UserManager.DISALLOW_SHARE_INTO_MANAGED_PROFILE, policy.shareIntoManagedProfileDisabled)
            setUserRestriction(UserManager.DISALLOW_AUTOFILL, policy.autofillDisabled)

            // Other
            setUserRestriction(UserManager.DISALLOW_AMBIENT_DISPLAY, policy.ambientDisplayDisabled)
            setUserRestriction(UserManager.DISALLOW_FUN, policy.funDisabled)
            setUserRestriction(UserManager.DISALLOW_DATA_ROAMING, policy.dataRoamingDisabled)
            setUserRestriction(UserManager.DISALLOW_MICROPHONE_TOGGLE, policy.microphoneToggleDisabled)
            setUserRestriction(UserManager.DISALLOW_BLUETOOTH_SHARING, policy.bluetoothSharingDisabled)

            // DPM Direct Methods
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                devicePolicyManager.setUsbDataSignalingEnabled(!policy.usbDataSignalingDisabled)
            }
            devicePolicyManager.setStatusBarDisabled(adminComponent, policy.statusBarDisabled)
            devicePolicyManager.setKeyguardDisabled(adminComponent, policy.keyguardDisabled)
            devicePolicyManager.setAutoTimeRequired(adminComponent, policy.autoTimeRequired)

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
