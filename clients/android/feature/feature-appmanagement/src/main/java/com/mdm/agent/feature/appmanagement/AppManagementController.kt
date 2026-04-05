package com.mdm.agent.feature.appmanagement

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

data class InstalledAppInfo(
    val packageName: String,
    val versionCode: Long,
    val versionName: String,
    val isSystem: Boolean,
)

@Singleton
class AppManagementController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePolicyManager: DevicePolicyManager,
    private val silentInstaller: SilentInstaller,
    private val managedConfigHandler: ManagedConfigHandler,
    private val connectionManager: ConnectionManager,
) {
    private val adminComponent = ComponentName(context, "com.mdm.agent.dpc.MdmDeviceAdminReceiver")

    // --- App visibility control ---

    fun hideApp(packageName: String): Boolean {
        return try {
            devicePolicyManager.setApplicationHidden(adminComponent, packageName, true)
            Timber.d("App hidden: %s", packageName)
            true
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to hide app: %s", packageName)
            false
        }
    }

    fun unhideApp(packageName: String): Boolean {
        return try {
            devicePolicyManager.setApplicationHidden(adminComponent, packageName, false)
            Timber.d("App unhidden: %s", packageName)
            true
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to unhide app: %s", packageName)
            false
        }
    }

    fun blockUninstall(packageName: String, block: Boolean): Boolean {
        return try {
            devicePolicyManager.setUninstallBlocked(adminComponent, packageName, block)
            Timber.d("App uninstall %s: %s", if (block) "blocked" else "unblocked", packageName)
            true
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to set uninstall block for: %s", packageName)
            false
        }
    }

    fun enableSystemApp(packageName: String): Boolean {
        return try {
            devicePolicyManager.enableSystemApp(adminComponent, packageName)
            Timber.d("System app enabled: %s", packageName)
            true
        } catch (e: SecurityException) {
            Timber.e(e, "Failed to enable system app: %s", packageName)
            false
        }
    }

    // --- Install/uninstall ---

    suspend fun installApp(downloadUrl: String, packageName: String): Result<Unit> {
        return silentInstaller.installApk(downloadUrl, packageName)
    }

    suspend fun uninstallApp(packageName: String): Result<Unit> {
        return silentInstaller.uninstallApp(packageName)
    }

    // --- App inventory for heartbeat ---

    fun getInstalledApps(): List<InstalledAppInfo> {
        return try {
            context.packageManager.getInstalledPackages(0).map { pkg ->
                InstalledAppInfo(
                    packageName = pkg.packageName,
                    versionCode = getVersionCode(pkg),
                    versionName = pkg.versionName ?: "",
                    isSystem = (pkg.applicationInfo?.flags ?: 0) and android.content.pm.ApplicationInfo.FLAG_SYSTEM != 0,
                )
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to get installed packages")
            emptyList()
        }
    }

    /**
     * Returns installed app data formatted for inclusion in device heartbeat.
     */
    fun getHeartbeatAppData(): List<Map<String, Any>> {
        return getInstalledApps().map { app ->
            mapOf(
                "package_name" to app.packageName,
                "version_code" to app.versionCode,
                "version_name" to app.versionName,
                "is_system" to app.isSystem,
            )
        }
    }

    fun isAppInstalled(packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, PackageManager.GET_META_DATA)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    fun getInstalledPackages(): List<String> {
        return context.packageManager.getInstalledPackages(0).map { it.packageName }
    }

    /**
     * Perform drift detection: compare installed apps against required/prohibited assignments
     * and trigger install/uninstall commands as needed.
     */
    suspend fun performDriftCheck(
        requiredApps: List<AppAssignmentInfo>,
        prohibitedApps: List<AppAssignmentInfo>,
    ) {
        val installed = getInstalledPackages().toSet()

        // Required apps that are missing -> install
        for (app in requiredApps) {
            if (!installed.contains(app.packageName)) {
                Timber.w("Drift detected: required app %s not installed, triggering install", app.packageName)
                if (app.downloadUrl != null) {
                    installApp(app.downloadUrl, app.packageName)
                }
            }
        }

        // Prohibited apps that are present -> uninstall
        for (app in prohibitedApps) {
            if (installed.contains(app.packageName)) {
                Timber.w("Drift detected: prohibited app %s is installed, triggering uninstall", app.packageName)
                uninstallApp(app.packageName)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun getVersionCode(pkg: PackageInfo): Long {
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            pkg.longVersionCode
        } else {
            pkg.versionCode.toLong()
        }
    }
}

data class AppAssignmentInfo(
    val packageName: String,
    val downloadUrl: String?,
    val installType: String,
)
