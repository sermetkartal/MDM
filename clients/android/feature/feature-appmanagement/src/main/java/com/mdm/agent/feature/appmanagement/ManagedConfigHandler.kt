package com.mdm.agent.feature.appmanagement

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Handles managed configuration (app restrictions) for managed apps.
 * Receives configuration bundles from the MDM server and applies them
 * via DevicePolicyManager.setApplicationRestrictions().
 *
 * Supported restriction types: string, int, boolean, string[]
 */
@Singleton
class ManagedConfigHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    fun setManagedConfiguration(packageName: String, config: Bundle) {
        try {
            devicePolicyManager.setApplicationRestrictions(adminComponent, packageName, config)
            Timber.d("Set managed configuration for: %s", packageName)
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set managed configuration for: %s", packageName)
        }
    }

    /**
     * Apply a managed configuration from a server-provided map.
     * Supports: string, int, boolean, string[] restriction types.
     */
    fun applyConfigurationFromServer(packageName: String, restrictions: Map<String, Any>) {
        val bundle = Bundle()
        for ((key, value) in restrictions) {
            when (value) {
                is String -> bundle.putString(key, value)
                is Int -> bundle.putInt(key, value)
                is Long -> bundle.putInt(key, value.toInt())
                is Boolean -> bundle.putBoolean(key, value)
                is Double -> bundle.putInt(key, value.toInt())
                is List<*> -> {
                    @Suppress("UNCHECKED_CAST")
                    val stringArray = (value as? List<String>)?.toTypedArray()
                    if (stringArray != null) {
                        bundle.putStringArray(key, stringArray)
                    }
                }
                is Array<*> -> {
                    @Suppress("UNCHECKED_CAST")
                    val stringArray = value as? Array<String>
                    if (stringArray != null) {
                        bundle.putStringArray(key, stringArray)
                    }
                }
                else -> {
                    Timber.w("Unsupported restriction type for key %s: %s", key, value::class.simpleName)
                }
            }
        }
        setManagedConfiguration(packageName, bundle)
    }

    fun getManagedConfiguration(packageName: String): Bundle {
        return try {
            devicePolicyManager.getApplicationRestrictions(adminComponent, packageName)
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to get managed configuration for: %s", packageName)
            Bundle.EMPTY
        }
    }

    fun clearManagedConfiguration(packageName: String) {
        setManagedConfiguration(packageName, Bundle.EMPTY)
    }

    fun setPermissionGrantState(packageName: String, permission: String, granted: Boolean): Boolean {
        return try {
            val grantState = if (granted) {
                DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
            } else {
                DevicePolicyManager.PERMISSION_GRANT_STATE_DENIED
            }
            devicePolicyManager.setPermissionGrantState(adminComponent, packageName, permission, grantState)
            Timber.d("Permission %s %s for %s", permission, if (granted) "granted" else "denied", packageName)
            true
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set permission grant state")
            false
        }
    }

    /**
     * Get current restrictions as a map for reporting back to server.
     */
    fun getConfigurationAsMap(packageName: String): Map<String, Any> {
        val bundle = getManagedConfiguration(packageName)
        val result = mutableMapOf<String, Any>()
        for (key in bundle.keySet()) {
            val value = bundle.get(key)
            if (value != null) {
                when (value) {
                    is String, is Int, is Boolean -> result[key] = value
                    is Array<*> -> result[key] = value.toList()
                    else -> result[key] = value.toString()
                }
            }
        }
        return result
    }
}
