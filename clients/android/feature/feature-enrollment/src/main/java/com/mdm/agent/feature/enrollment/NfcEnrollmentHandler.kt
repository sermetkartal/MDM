package com.mdm.agent.feature.enrollment

import android.content.Context
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import com.mdm.agent.feature.enrollment.model.EnrollmentConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NfcEnrollmentHandler @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    suspend fun enroll(config: EnrollmentConfig) {
        Timber.d("Processing NFC enrollment for server: %s", config.serverUrl)
    }

    fun isNfcAvailable(): Boolean {
        val nfcAdapter = NfcAdapter.getDefaultAdapter(context)
        return nfcAdapter != null && nfcAdapter.isEnabled
    }

    fun createProvisioningNdefMessage(config: EnrollmentConfig): NdefMessage {
        val properties = buildString {
            appendLine("android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME=com.mdm.agent/com.mdm.agent.dpc.MdmDeviceAdminReceiver")
            appendLine("android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION=${config.serverUrl}/agent.apk")
            if (config.wifiSsid != null) {
                appendLine("android.app.extra.PROVISIONING_WIFI_SSID=${config.wifiSsid}")
            }
            if (config.wifiPassword != null) {
                appendLine("android.app.extra.PROVISIONING_WIFI_PASSWORD=${config.wifiPassword}")
            }
            if (config.locale != null) {
                appendLine("android.app.extra.PROVISIONING_LOCALE=${config.locale}")
            }
            if (config.skipEncryption) {
                appendLine("android.app.extra.PROVISIONING_SKIP_ENCRYPTION=true")
            }
        }

        val ndefRecord = NdefRecord.createMime(
            NfcAdapter.ACTION_NDEF_DISCOVERED,
            properties.toByteArray(Charsets.UTF_8)
        )
        return NdefMessage(arrayOf(ndefRecord))
    }
}
