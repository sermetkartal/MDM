package com.mdm.agent.core.security

import android.util.Base64
import timber.log.Timber
import java.security.Signature
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EncryptionHelper @Inject constructor(
    private val keystoreManager: KeystoreManager,
) {
    fun encrypt(data: ByteArray): EncryptedData? {
        return try {
            val key = keystoreManager.getEncryptionKey() ?: run {
                keystoreManager.generateEncryptionKey()
                keystoreManager.getEncryptionKey()
            } ?: return null

            val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)

            val encrypted = cipher.doFinal(data)
            EncryptedData(
                ciphertext = encrypted,
                iv = cipher.iv,
            )
        } catch (e: Exception) {
            Timber.e(e, "Encryption failed")
            null
        }
    }

    fun decrypt(encryptedData: EncryptedData): ByteArray? {
        return try {
            val key = keystoreManager.getEncryptionKey() ?: return null

            val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, encryptedData.iv)
            cipher.init(Cipher.DECRYPT_MODE, key, spec)

            cipher.doFinal(encryptedData.ciphertext)
        } catch (e: Exception) {
            Timber.e(e, "Decryption failed")
            null
        }
    }

    fun sign(data: ByteArray): ByteArray? {
        return try {
            val privateKey = keystoreManager.getPrivateKey() ?: return null

            Signature.getInstance("SHA256withRSA").run {
                initSign(privateKey)
                update(data)
                sign()
            }
        } catch (e: Exception) {
            Timber.e(e, "Signing failed")
            null
        }
    }

    fun verify(data: ByteArray, signature: ByteArray): Boolean {
        return try {
            val publicKey = keystoreManager.getPublicKey() ?: return false

            Signature.getInstance("SHA256withRSA").run {
                initVerify(publicKey)
                update(data)
                verify(signature)
            }
        } catch (e: Exception) {
            Timber.e(e, "Verification failed")
            false
        }
    }

    fun encryptToBase64(data: String): String? {
        val encrypted = encrypt(data.toByteArray(Charsets.UTF_8)) ?: return null
        val combined = encrypted.iv + encrypted.ciphertext
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    fun decryptFromBase64(encoded: String): String? {
        val combined = Base64.decode(encoded, Base64.NO_WRAP)
        val iv = combined.copyOfRange(0, GCM_IV_LENGTH)
        val ciphertext = combined.copyOfRange(GCM_IV_LENGTH, combined.size)
        val decrypted = decrypt(EncryptedData(ciphertext, iv)) ?: return null
        return String(decrypted, Charsets.UTF_8)
    }

    data class EncryptedData(
        val ciphertext: ByteArray,
        val iv: ByteArray,
    )

    companion object {
        private const val AES_GCM_TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128
        private const val GCM_IV_LENGTH = 12
    }
}
