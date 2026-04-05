package com.mdm.agent.feature.kiosk

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.InputType
import android.util.Base64
import android.view.Gravity
import android.view.WindowManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdminEscapeHatch @Inject constructor(
    @ApplicationContext private val context: Context,
    private val kioskOrchestrator: KioskOrchestrator,
) {
    private var tapTimestamps = mutableListOf<Long>()
    private var failedAttempts = 0
    private var lockoutUntil = 0L
    private var onEscapeTriggered: (() -> Unit)? = null
    private var onServerNotification: ((String) -> Unit)? = null

    fun onCornerTap() {
        val now = System.currentTimeMillis()

        // Remove taps older than TAP_WINDOW_MS
        tapTimestamps.removeAll { now - it > TAP_WINDOW_MS }
        tapTimestamps.add(now)

        if (tapTimestamps.size >= REQUIRED_TAPS) {
            Timber.d("Admin escape hatch triggered, awaiting PIN")
            tapTimestamps.clear()
            onEscapeTriggered?.invoke()
        }
    }

    fun setOnEscapeTriggeredListener(listener: () -> Unit) {
        onEscapeTriggered = listener
    }

    fun setOnServerNotificationListener(listener: (String) -> Unit) {
        onServerNotification = listener
    }

    fun showPinDialog(context: Context) {
        val now = System.currentTimeMillis()
        if (now < lockoutUntil) {
            val remainingSeconds = ((lockoutUntil - now) / 1000).toInt()
            showLockoutMessage(context, remainingSeconds)
            return
        }

        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(60, 40, 60, 20)
            setBackgroundColor(Color.WHITE)
        }

        val title = TextView(context).apply {
            text = "Admin Access"
            textSize = 20f
            setTextColor(Color.BLACK)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 20)
        }
        layout.addView(title)

        val pinInput = EditText(context).apply {
            hint = "Enter PIN"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            textSize = 18f
        }
        layout.addView(pinInput)

        val attemptsText = TextView(context).apply {
            if (failedAttempts > 0) {
                text = "Failed attempts: $failedAttempts / $MAX_FAILED_ATTEMPTS"
                setTextColor(Color.RED)
            }
            textSize = 12f
            setPadding(0, 10, 0, 0)
        }
        layout.addView(attemptsText)

        val dialog = AlertDialog.Builder(context)
            .setView(layout)
            .setPositiveButton("Verify") { _, _ ->
                val pin = pinInput.text.toString()
                handlePinSubmission(context, pin)
            }
            .setNegativeButton("Cancel", null)
            .create()

        dialog.window?.setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY)
        dialog.setCancelable(false)
        dialog.show()
    }

    private fun handlePinSubmission(context: Context, pin: String) {
        if (verifyPin(pin)) {
            Timber.d("Admin escape PIN accepted")
            failedAttempts = 0
            showAdminMenu(context)
        } else {
            failedAttempts++
            Timber.w("Invalid admin escape PIN attempt (%d/%d)", failedAttempts, MAX_FAILED_ATTEMPTS)

            if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                lockoutUntil = System.currentTimeMillis() + LOCKOUT_DURATION_MS
                Timber.w("Max failed attempts reached, locked out for %d seconds", LOCKOUT_DURATION_MS / 1000)
                onServerNotification?.invoke("admin_escape_lockout")
                failedAttempts = 0
                showLockoutMessage(context, (LOCKOUT_DURATION_MS / 1000).toInt())
            } else {
                showPinDialog(context)
            }
        }
    }

    fun submitPin(pin: String): Boolean {
        val config = kioskOrchestrator.getCurrentConfig() ?: return false

        if (config.adminEscapePin.isEmpty()) {
            Timber.w("No admin escape PIN configured")
            return false
        }

        if (verifyPin(pin)) {
            Timber.d("Admin escape PIN accepted, exiting kiosk")
            failedAttempts = 0
            return true
        }

        failedAttempts++
        Timber.w("Invalid admin escape PIN attempt (%d/%d)", failedAttempts, MAX_FAILED_ATTEMPTS)

        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
            lockoutUntil = System.currentTimeMillis() + LOCKOUT_DURATION_MS
            onServerNotification?.invoke("admin_escape_lockout")
            failedAttempts = 0
        }

        return false
    }

    private fun verifyPin(pin: String): Boolean {
        // First try encrypted PIN from AndroidKeyStore
        val storedEncrypted = getEncryptedPin()
        if (storedEncrypted != null) {
            val decrypted = decryptPin(storedEncrypted)
            return decrypted == pin
        }

        // Fallback to config PIN
        val config = kioskOrchestrator.getCurrentConfig() ?: return false
        return config.adminEscapePin.isNotEmpty() && config.adminEscapePin == pin
    }

    fun storePin(pin: String) {
        try {
            val encryptedData = encryptPin(pin)
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(KEY_ENCRYPTED_PIN, Base64.encodeToString(encryptedData.ciphertext, Base64.NO_WRAP))
                .putString(KEY_PIN_IV, Base64.encodeToString(encryptedData.iv, Base64.NO_WRAP))
                .apply()
            Timber.d("Admin PIN stored encrypted in AndroidKeyStore")
        } catch (e: Exception) {
            Timber.e(e, "Failed to store encrypted PIN")
        }
    }

    private fun encryptPin(pin: String): EncryptedData {
        val secretKey = getOrCreateSecretKey()
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey)
        val ciphertext = cipher.doFinal(pin.toByteArray(Charsets.UTF_8))
        return EncryptedData(ciphertext, cipher.iv)
    }

    private fun decryptPin(data: EncryptedData): String? {
        return try {
            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, data.iv)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
            String(cipher.doFinal(data.ciphertext), Charsets.UTF_8)
        } catch (e: Exception) {
            Timber.e(e, "Failed to decrypt PIN")
            null
        }
    }

    private fun getEncryptedPin(): EncryptedData? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val cipherStr = prefs.getString(KEY_ENCRYPTED_PIN, null) ?: return null
        val ivStr = prefs.getString(KEY_PIN_IV, null) ?: return null
        return EncryptedData(
            Base64.decode(cipherStr, Base64.NO_WRAP),
            Base64.decode(ivStr, Base64.NO_WRAP)
        )
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)

        keyStore.getKey(KEYSTORE_ALIAS, null)?.let { return it as SecretKey }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return keyGenerator.generateKey()
    }

    fun isEscapeHatchAvailable(): Boolean {
        val config = kioskOrchestrator.getCurrentConfig() ?: return false
        return config.adminEscapePin.isNotEmpty() || getEncryptedPin() != null
    }

    private fun showAdminMenu(context: Context) {
        val options = arrayOf(
            "Exit Kiosk Temporarily",
            "Exit Kiosk Permanently",
            "Change Kiosk App",
            "Device Info",
            "Force Sync",
        )

        AlertDialog.Builder(context)
            .setTitle("Admin Menu")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> kioskOrchestrator.exitKiosk()
                    1 -> {
                        kioskOrchestrator.exitKiosk()
                        kioskOrchestrator.clearPersistedConfig()
                    }
                    2 -> onServerNotification?.invoke("change_kiosk_app")
                    3 -> onServerNotification?.invoke("show_device_info")
                    4 -> onServerNotification?.invoke("force_sync")
                }
            }
            .setNegativeButton("Cancel", null)
            .create()
            .apply {
                window?.setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY)
                show()
            }
    }

    private fun showLockoutMessage(context: Context, remainingSeconds: Int) {
        AlertDialog.Builder(context)
            .setTitle("Locked Out")
            .setMessage("Too many failed attempts. Try again in $remainingSeconds seconds.")
            .setPositiveButton("OK", null)
            .create()
            .apply {
                window?.setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY)
                show()
            }
    }

    private data class EncryptedData(val ciphertext: ByteArray, val iv: ByteArray)

    companion object {
        private const val REQUIRED_TAPS = 7
        private const val TAP_WINDOW_MS = 3_000L
        private const val MAX_FAILED_ATTEMPTS = 5
        private const val LOCKOUT_DURATION_MS = 30_000L
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEYSTORE_ALIAS = "mdm_kiosk_admin_pin"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128
        private const val PREFS_NAME = "mdm_kiosk_admin"
        private const val KEY_ENCRYPTED_PIN = "encrypted_pin"
        private const val KEY_PIN_IV = "pin_iv"
    }
}
