package com.mdm.agent.core.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import timber.log.Timber
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.cert.Certificate
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class KeystoreManager @Inject constructor() {

    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun generateDeviceKeyPair(alias: String = DEVICE_KEY_ALIAS): Boolean {
        return try {
            if (keyStore.containsAlias(alias)) {
                Timber.d("Key pair already exists for alias: %s", alias)
                return true
            }

            val spec = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                .setKeySize(2048)
                .setUserAuthenticationRequired(false)
                .build()

            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, ANDROID_KEYSTORE).apply {
                initialize(spec)
                generateKeyPair()
            }

            Timber.d("Generated device key pair for alias: %s", alias)
            true
        } catch (e: Exception) {
            Timber.e(e, "Failed to generate device key pair")
            false
        }
    }

    fun generateEncryptionKey(alias: String = ENCRYPTION_KEY_ALIAS): Boolean {
        return try {
            if (keyStore.containsAlias(alias)) return true

            val spec = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()

            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).apply {
                init(spec)
                generateKey()
            }

            Timber.d("Generated encryption key for alias: %s", alias)
            true
        } catch (e: Exception) {
            Timber.e(e, "Failed to generate encryption key")
            false
        }
    }

    fun getPrivateKey(alias: String = DEVICE_KEY_ALIAS): PrivateKey? {
        return keyStore.getKey(alias, null) as? PrivateKey
    }

    fun getPublicKey(alias: String = DEVICE_KEY_ALIAS): PublicKey? {
        return keyStore.getCertificate(alias)?.publicKey
    }

    fun getCertificate(alias: String = DEVICE_KEY_ALIAS): Certificate? {
        return keyStore.getCertificate(alias)
    }

    fun getEncryptionKey(alias: String = ENCRYPTION_KEY_ALIAS): SecretKey? {
        return keyStore.getKey(alias, null) as? SecretKey
    }

    fun deleteKey(alias: String) {
        if (keyStore.containsAlias(alias)) {
            keyStore.deleteEntry(alias)
            Timber.d("Deleted key with alias: %s", alias)
        }
    }

    fun hasKey(alias: String): Boolean = keyStore.containsAlias(alias)

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val DEVICE_KEY_ALIAS = "mdm_device_key"
        const val ENCRYPTION_KEY_ALIAS = "mdm_encryption_key"
    }
}
