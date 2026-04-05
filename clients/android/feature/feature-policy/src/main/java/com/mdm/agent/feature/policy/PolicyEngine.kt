package com.mdm.agent.feature.policy

import com.mdm.agent.core.database.dao.DeviceDao
import com.mdm.agent.feature.policy.model.DevicePolicies
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PolicyEngine @Inject constructor(
    private val deviceDao: DeviceDao,
    private val restrictionApplicator: RestrictionPolicyApplicator,
    private val passwordApplicator: PasswordPolicyApplicator,
    private val networkApplicator: NetworkPolicyApplicator,
) {
    private var currentPolicies: DevicePolicies? = null

    suspend fun applyPolicies(policies: DevicePolicies) {
        Timber.d("Applying policies version: %d", policies.version)

        val currentVersion = currentPolicies?.version ?: 0
        if (policies.version <= currentVersion) {
            Timber.d("Policy version %d already applied (current: %d)", policies.version, currentVersion)
            return
        }

        policies.restrictionPolicy?.let { restriction ->
            restrictionApplicator.apply(restriction)
        }

        policies.passwordPolicy?.let { password ->
            passwordApplicator.apply(password)
        }

        policies.networkPolicy?.let { network ->
            networkApplicator.apply(network)
        }

        currentPolicies = policies

        val device = deviceDao.getDevice()
        if (device != null) {
            deviceDao.updatePolicyVersion(device.deviceId, policies.version)
        }

        Timber.d("Policies version %d applied successfully", policies.version)
    }

    fun getCurrentPolicies(): DevicePolicies? = currentPolicies

    fun getCurrentVersion(): Long = currentPolicies?.version ?: 0
}
