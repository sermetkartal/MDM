package com.mdm.agent.feature.monitoring

import android.content.Context
import android.os.Environment
import android.os.StatFs
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StorageMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun getStorageInfo(): StorageInfo {
        val stat = StatFs(Environment.getDataDirectory().path)
        val totalBytes = stat.totalBytes
        val availableBytes = stat.availableBytes
        val usedBytes = totalBytes - availableBytes

        return StorageInfo(
            totalBytes = totalBytes,
            availableBytes = availableBytes,
            usedBytes = usedBytes,
            usagePercent = if (totalBytes > 0) (usedBytes * 100.0 / totalBytes) else 0.0,
        )
    }

    fun getExternalStorageInfo(): StorageInfo? {
        val externalDirs = context.getExternalFilesDirs(null)
        if (externalDirs.size < 2 || externalDirs[1] == null) return null

        val stat = StatFs(externalDirs[1].path)
        val totalBytes = stat.totalBytes
        val availableBytes = stat.availableBytes
        val usedBytes = totalBytes - availableBytes

        return StorageInfo(
            totalBytes = totalBytes,
            availableBytes = availableBytes,
            usedBytes = usedBytes,
            usagePercent = if (totalBytes > 0) (usedBytes * 100.0 / totalBytes) else 0.0,
        )
    }

    data class StorageInfo(
        val totalBytes: Long,
        val availableBytes: Long,
        val usedBytes: Long,
        val usagePercent: Double,
    )
}
