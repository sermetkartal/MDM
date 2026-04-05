package com.mdm.agent.feature.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.net.ProxyInfo
import com.mdm.agent.feature.policy.model.NetworkPolicy
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NetworkPolicyApplicator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    fun apply(policy: NetworkPolicy) {
        Timber.d("Applying network policy")

        try {
            if (policy.vpnAlwaysOn && policy.vpnPackage != null) {
                devicePolicyManager.setAlwaysOnVpnPackage(
                    adminComponent,
                    policy.vpnPackage,
                    policy.vpnLockdown
                )
                Timber.d("Set always-on VPN: package=%s, lockdown=%b", policy.vpnPackage, policy.vpnLockdown)
            } else {
                devicePolicyManager.setAlwaysOnVpnPackage(adminComponent, null, false)
            }

            policy.globalProxy?.let { proxy ->
                val proxyInfo = ProxyInfo.buildDirectProxy(
                    proxy.host,
                    proxy.port,
                    proxy.exclusionList
                )
                devicePolicyManager.setRecommendedGlobalProxy(adminComponent, proxyInfo)
                Timber.d("Set global proxy: %s:%d", proxy.host, proxy.port)
            }

            Timber.d("Network policy applied successfully")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to apply network policy")
        }
    }
}
