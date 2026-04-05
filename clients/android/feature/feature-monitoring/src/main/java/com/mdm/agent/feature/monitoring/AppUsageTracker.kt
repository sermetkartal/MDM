package com.mdm.agent.feature.monitoring

import android.app.usage.UsageStatsManager
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppUsageTracker @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

    fun getAppUsageStats(startTime: Long, endTime: Long): List<AppUsageInfo> {
        val stats = usageStatsManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            startTime,
            endTime
        )

        return stats
            ?.filter { it.totalTimeInForeground > 0 }
            ?.map { stat ->
                AppUsageInfo(
                    packageName = stat.packageName,
                    totalTimeInForegroundMs = stat.totalTimeInForeground,
                    lastTimeUsed = stat.lastTimeUsed,
                )
            }
            ?.sortedByDescending { it.totalTimeInForegroundMs }
            ?: emptyList()
    }

    fun getForegroundApp(): String? {
        val now = System.currentTimeMillis()
        val stats = usageStatsManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            now - 10_000,
            now
        )
        return stats?.maxByOrNull { it.lastTimeUsed }?.packageName
    }

    fun getInstalledApps(): List<InstalledAppInfo> {
        val pm = context.packageManager
        val packages = pm.getInstalledPackages(0)

        return packages.map { pkg ->
            InstalledAppInfo(
                packageName = pkg.packageName,
                versionName = pkg.versionName ?: "unknown",
                versionCode = pkg.longVersionCode,
                isSystemApp = (pkg.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0,
            )
        }
    }

    data class AppUsageInfo(
        val packageName: String,
        val totalTimeInForegroundMs: Long,
        val lastTimeUsed: Long,
    )

    data class InstalledAppInfo(
        val packageName: String,
        val versionName: String,
        val versionCode: Long,
        val isSystemApp: Boolean,
    )
}
