package com.mdm.agent.dpc

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserHandle
import timber.log.Timber

class MdmDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Timber.d("Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Timber.d("Device admin disabled")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Timber.d("Profile provisioning complete")

        val manager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val component = getComponentName(context)

        manager.setProfileName(component, "MDM Managed Profile")
        manager.setProfileEnabled(component)
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        super.onLockTaskModeEntering(context, intent, pkg)
        Timber.d("Lock task mode entering for package: %s", pkg)
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        super.onLockTaskModeExiting(context, intent)
        Timber.d("Lock task mode exiting")
    }

    override fun onSecurityLogsAvailable(context: Context, intent: Intent) {
        super.onSecurityLogsAvailable(context, intent)
        Timber.d("Security logs available")

        val manager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val events = manager.retrieveSecurityLogs(getComponentName(context))
        Timber.d("Retrieved %d security log events", events?.size ?: 0)
    }

    override fun onNetworkLogsAvailable(context: Context, intent: Intent, batchToken: Long) {
        super.onNetworkLogsAvailable(context, intent, batchToken)
        Timber.d("Network logs available, batch token: %d", batchToken)

        val manager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val events = manager.retrieveNetworkLogs(getComponentName(context), batchToken)
        Timber.d("Retrieved %d network log events", events?.size ?: 0)
    }

    override fun onPasswordChanged(context: Context, intent: Intent, userHandle: UserHandle) {
        super.onPasswordChanged(context, intent, userHandle)
        Timber.d("Password changed for user: %s", userHandle)
    }

    override fun onPasswordFailed(context: Context, intent: Intent, userHandle: UserHandle) {
        super.onPasswordFailed(context, intent, userHandle)
        Timber.w("Password attempt failed for user: %s", userHandle)
    }

    override fun onPasswordSucceeded(context: Context, intent: Intent, userHandle: UserHandle) {
        super.onPasswordSucceeded(context, intent, userHandle)
        Timber.d("Password succeeded for user: %s", userHandle)
    }

    companion object {
        fun getComponentName(context: Context): ComponentName {
            return ComponentName(context.applicationContext, MdmDeviceAdminReceiver::class.java)
        }
    }
}
