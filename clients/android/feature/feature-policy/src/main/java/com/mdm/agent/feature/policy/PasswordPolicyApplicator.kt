package com.mdm.agent.feature.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import com.mdm.agent.feature.policy.model.PasswordPolicy
import com.mdm.agent.feature.policy.model.PasswordQuality
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PasswordPolicyApplicator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    fun apply(policy: PasswordPolicy) {
        Timber.d("Applying password policy")

        try {
            val quality = mapPasswordQuality(policy.quality)
            devicePolicyManager.setPasswordQuality(adminComponent, quality)

            if (policy.minimumLength > 0) {
                devicePolicyManager.setPasswordMinimumLength(adminComponent, policy.minimumLength)
            }
            if (policy.minimumUpperCase > 0) {
                devicePolicyManager.setPasswordMinimumUpperCase(adminComponent, policy.minimumUpperCase)
            }
            if (policy.minimumLowerCase > 0) {
                devicePolicyManager.setPasswordMinimumLowerCase(adminComponent, policy.minimumLowerCase)
            }
            if (policy.minimumNumeric > 0) {
                devicePolicyManager.setPasswordMinimumNumeric(adminComponent, policy.minimumNumeric)
            }
            if (policy.minimumSymbols > 0) {
                devicePolicyManager.setPasswordMinimumSymbols(adminComponent, policy.minimumSymbols)
            }
            if (policy.maximumFailedAttempts > 0) {
                devicePolicyManager.setMaximumFailedPasswordsForWipe(adminComponent, policy.maximumFailedAttempts)
            }
            if (policy.expirationTimeoutMs > 0) {
                devicePolicyManager.setPasswordExpirationTimeout(adminComponent, policy.expirationTimeoutMs)
            }
            if (policy.historyLength > 0) {
                devicePolicyManager.setPasswordHistoryLength(adminComponent, policy.historyLength)
            }

            Timber.d("Password policy applied successfully")
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to apply password policy")
        }
    }

    fun isPasswordCompliant(): Boolean {
        return devicePolicyManager.isActivePasswordSufficient
    }

    private fun mapPasswordQuality(quality: PasswordQuality): Int {
        return when (quality) {
            PasswordQuality.UNSPECIFIED -> DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED
            PasswordQuality.BIOMETRIC_WEAK -> DevicePolicyManager.PASSWORD_QUALITY_BIOMETRIC_WEAK
            PasswordQuality.SOMETHING -> DevicePolicyManager.PASSWORD_QUALITY_SOMETHING
            PasswordQuality.NUMERIC -> DevicePolicyManager.PASSWORD_QUALITY_NUMERIC
            PasswordQuality.NUMERIC_COMPLEX -> DevicePolicyManager.PASSWORD_QUALITY_NUMERIC_COMPLEX
            PasswordQuality.ALPHABETIC -> DevicePolicyManager.PASSWORD_QUALITY_ALPHABETIC
            PasswordQuality.ALPHANUMERIC -> DevicePolicyManager.PASSWORD_QUALITY_ALPHANUMERIC
            PasswordQuality.COMPLEX -> DevicePolicyManager.PASSWORD_QUALITY_COMPLEX
        }
    }
}
