package com.mdm.agent.core.security

import android.content.Context
import com.google.android.gms.safetynet.SafetyNet
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import timber.log.Timber
import java.security.KeyStore
import java.security.cert.X509Certificate
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class AttestationManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val keystoreManager: KeystoreManager,
) {
    suspend fun getKeyAttestation(): AttestationResult {
        return try {
            val alias = KeystoreManager.DEVICE_KEY_ALIAS
            if (!keystoreManager.hasKey(alias)) {
                keystoreManager.generateDeviceKeyPair(alias)
            }

            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val chain = keyStore.getCertificateChain(alias)
                ?.map { it as X509Certificate }
                ?: return AttestationResult.Error("No certificate chain available")

            val encodedChain = chain.map { it.encoded }
            AttestationResult.Success(encodedChain)
        } catch (e: Exception) {
            Timber.e(e, "Key attestation failed")
            AttestationResult.Error(e.message ?: "Key attestation failed")
        }
    }

    fun getDeviceIntegrityReport(): Map<String, Any> {
        val rootDetector = RootDetector()
        return mapOf(
            "rooted" to rootDetector.isDeviceRooted(),
            "root_indicators" to rootDetector.getRootIndicators(),
            "has_device_key" to keystoreManager.hasKey(KeystoreManager.DEVICE_KEY_ALIAS),
            "has_encryption_key" to keystoreManager.hasKey(KeystoreManager.ENCRYPTION_KEY_ALIAS),
        )
    }

    sealed class AttestationResult {
        data class Success(val certificateChain: List<ByteArray>) : AttestationResult()
        data class Error(val message: String) : AttestationResult()
    }
}
