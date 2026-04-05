package com.mdm.agent.feature.enrollment

import android.content.Context
import com.mdm.agent.feature.enrollment.model.EnrollmentConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class QrEnrollmentHandler @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    suspend fun enroll(config: EnrollmentConfig) {
        Timber.d("Processing QR enrollment for server: %s", config.serverUrl)
    }

    fun parseQrPayload(qrData: String): EnrollmentConfig? {
        return try {
            val json = JSONObject(qrData)
            EnrollmentConfig(
                serverUrl = json.getString("server_url"),
                tenantId = json.getString("tenant_id"),
                enrollmentToken = json.getString("enrollment_token"),
                enrollmentMethod = com.mdm.agent.feature.enrollment.model.EnrollmentMethod.QR_CODE,
                deviceOwnerMode = json.optBoolean("device_owner", true),
                wifiSsid = json.optString("wifi_ssid", null),
                wifiPassword = json.optString("wifi_password", null),
                locale = json.optString("locale", null),
                skipEncryption = json.optBoolean("skip_encryption", false),
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to parse QR payload")
            null
        }
    }

    companion object {
        const val EXTRA_PROVISIONING_WIFI_SSID = "android.app.extra.PROVISIONING_WIFI_SSID"
        const val EXTRA_PROVISIONING_WIFI_PASSWORD = "android.app.extra.PROVISIONING_WIFI_PASSWORD"
        const val EXTRA_PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME = "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME"
    }
}
