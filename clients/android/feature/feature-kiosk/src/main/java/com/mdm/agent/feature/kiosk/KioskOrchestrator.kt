package com.mdm.agent.feature.kiosk

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import com.mdm.agent.core.common.Constants
import com.mdm.agent.feature.kiosk.model.KioskConfiguration
import com.mdm.agent.feature.kiosk.model.KioskMode
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class KioskOrchestrator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val lockTaskController: LockTaskController,
    private val kioskBrandingManager: KioskBrandingManager,
    private val signageController: SignageController,
    private val webKioskController: WebKioskController,
    private val peripheralPolicyManager: PeripheralPolicyManager,
) {
    private val _isKioskActive = MutableStateFlow(false)
    val isKioskActive: StateFlow<Boolean> = _isKioskActive.asStateFlow()

    private var currentConfig: KioskConfiguration? = null

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val prefs: SharedPreferences
        get() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        // Restore persisted config on startup
        restorePersistedConfig()
    }

    fun enterKiosk(config: KioskConfiguration) {
        Timber.d("Entering kiosk mode: %s", config.mode)

        if (!validateConfig(config)) {
            Timber.e("Invalid kiosk configuration, aborting")
            return
        }

        currentConfig = config
        persistConfig(config)

        // Determine allowed packages for lock task
        val packages = buildList {
            add(context.packageName)
            when (config.mode) {
                KioskMode.SINGLE_APP -> config.targetPackage?.let { add(it) }
                KioskMode.MULTI_APP -> addAll(config.allowedPackages)
                KioskMode.WEB_KIOSK, KioskMode.DIGITAL_SIGNAGE -> { /* Only our package */ }
                KioskMode.ASSESSMENT -> config.targetPackage?.let { add(it) }
            }
        }.distinct()

        // Configure lock task mode
        lockTaskController.enterLockTaskMode(packages, config)

        // Apply peripheral restrictions
        peripheralPolicyManager.applyPolicy(config.peripheralPolicy)

        // Apply branding
        if (config.brandingLogoUrl != null || config.brandingBackgroundColor != null) {
            kioskBrandingManager.applyBranding(config)
        }

        // Start watchdog
        if (config.watchdogEnabled) {
            startWatchdog()
        }

        // Store admin escape PIN if provided
        if (config.adminEscapePin.isNotEmpty()) {
            // PIN is stored by AdminEscapeHatch when it's configured
        }

        // Launch KioskLauncher as HOME
        launchKioskLauncher()

        _isKioskActive.value = true
        prefs.edit().putBoolean(Constants.PREF_KIOSK_ACTIVE, true).apply()
        Timber.d("Kiosk mode entered successfully")
    }

    fun exitKiosk() {
        Timber.d("Exiting kiosk mode")

        signageController.stopSignage()
        webKioskController.stopWebKiosk()
        stopWatchdog()
        lockTaskController.stopLockTask()
        peripheralPolicyManager.clearAllRestrictions()
        kioskBrandingManager.resetBranding()

        currentConfig = null
        _isKioskActive.value = false
        prefs.edit().putBoolean(Constants.PREF_KIOSK_ACTIVE, false).apply()

        Timber.d("Kiosk mode exited")
    }

    fun exitKiosk(pin: String): Boolean {
        val config = currentConfig ?: return false
        if (config.adminEscapePin.isNotEmpty() && config.adminEscapePin != pin) {
            Timber.w("Invalid PIN provided for kiosk exit")
            return false
        }
        exitKiosk()
        return true
    }

    fun updateConfig(config: KioskConfiguration) {
        if (!_isKioskActive.value) {
            currentConfig = config
            persistConfig(config)
            return
        }

        val oldConfig = currentConfig
        if (oldConfig == null) {
            enterKiosk(config)
            return
        }

        // Check if we can apply changes without full restart
        val needsRestart = oldConfig.mode != config.mode ||
            oldConfig.targetPackage != config.targetPackage ||
            oldConfig.allowedPackages != config.allowedPackages

        if (needsRestart) {
            Timber.d("Config change requires full kiosk restart")
            exitKiosk()
            enterKiosk(config)
        } else {
            Timber.d("Applying config changes without restart")
            currentConfig = config
            persistConfig(config)

            // Apply individual changes
            if (oldConfig.peripheralPolicy != config.peripheralPolicy) {
                peripheralPolicyManager.applyPolicy(config.peripheralPolicy)
            }
            if (oldConfig.brandingLogoUrl != config.brandingLogoUrl ||
                oldConfig.brandingBackgroundColor != config.brandingBackgroundColor
            ) {
                kioskBrandingManager.applyBranding(config)
            }
            if (oldConfig.watchdogEnabled != config.watchdogEnabled) {
                if (config.watchdogEnabled) startWatchdog() else stopWatchdog()
            }

            lockTaskController.setLockTaskFeatures(config)
        }
    }

    fun isKioskActive(): Boolean = _isKioskActive.value

    fun getCurrentConfig(): KioskConfiguration? = currentConfig

    fun clearPersistedConfig() {
        prefs.edit()
            .remove(KEY_PERSISTED_CONFIG)
            .putBoolean(Constants.PREF_KIOSK_ACTIVE, false)
            .apply()
        Timber.d("Cleared persisted kiosk config")
    }

    private fun validateConfig(config: KioskConfiguration): Boolean {
        return when (config.mode) {
            KioskMode.SINGLE_APP, KioskMode.ASSESSMENT -> {
                if (config.targetPackage.isNullOrBlank()) {
                    Timber.e("Single-app/assessment mode requires targetPackage")
                    false
                } else true
            }
            KioskMode.MULTI_APP -> {
                if (config.allowedPackages.isEmpty()) {
                    Timber.e("Multi-app mode requires at least one allowed package")
                    false
                } else true
            }
            KioskMode.WEB_KIOSK -> {
                if (config.webKioskUrl.isNullOrBlank()) {
                    Timber.e("Web kiosk mode requires webKioskUrl")
                    false
                } else true
            }
            KioskMode.DIGITAL_SIGNAGE -> {
                if (config.signagePlaylist.isEmpty() && config.signageUrl.isNullOrBlank()) {
                    Timber.e("Digital signage mode requires playlist or signageUrl")
                    false
                } else true
            }
        }
    }

    private fun persistConfig(config: KioskConfiguration) {
        try {
            val configJson = json.encodeToString(config)
            prefs.edit().putString(KEY_PERSISTED_CONFIG, configJson).apply()
            Timber.d("Persisted kiosk configuration")
        } catch (e: Exception) {
            Timber.e(e, "Failed to persist kiosk configuration")
        }
    }

    private fun restorePersistedConfig() {
        try {
            val isActive = prefs.getBoolean(Constants.PREF_KIOSK_ACTIVE, false)
            if (!isActive) return

            val configJson = prefs.getString(KEY_PERSISTED_CONFIG, null) ?: return
            val config = json.decodeFromString<KioskConfiguration>(configJson)
            currentConfig = config
            _isKioskActive.value = true
            Timber.d("Restored persisted kiosk config: mode=%s", config.mode)
        } catch (e: Exception) {
            Timber.e(e, "Failed to restore persisted kiosk configuration")
        }
    }

    private fun launchKioskLauncher() {
        val intent = Intent(context, KioskLauncher::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
        context.startActivity(intent)
    }

    private fun startWatchdog() {
        val intent = Intent(context, KioskWatchdog::class.java)
        context.startForegroundService(intent)
    }

    private fun stopWatchdog() {
        val intent = Intent(context, KioskWatchdog::class.java)
        context.stopService(intent)
    }

    companion object {
        private const val PREFS_NAME = "mdm_kiosk"
        private const val KEY_PERSISTED_CONFIG = "kiosk_config_json"
    }
}
