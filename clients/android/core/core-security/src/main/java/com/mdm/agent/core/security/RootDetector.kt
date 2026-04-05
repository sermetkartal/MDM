package com.mdm.agent.core.security

import android.os.Build
import timber.log.Timber
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RootDetector @Inject constructor() {

    fun isDeviceRooted(): Boolean {
        return checkRootBinaries() ||
                checkBuildTags() ||
                checkDangerousProps() ||
                checkSuExists() ||
                checkRWPaths()
    }

    fun getRootIndicators(): List<String> {
        val indicators = mutableListOf<String>()
        if (checkRootBinaries()) indicators.add("root_binaries_found")
        if (checkBuildTags()) indicators.add("test_keys_build")
        if (checkDangerousProps()) indicators.add("dangerous_properties")
        if (checkSuExists()) indicators.add("su_binary_accessible")
        if (checkRWPaths()) indicators.add("rw_system_paths")
        return indicators
    }

    private fun checkRootBinaries(): Boolean {
        val paths = listOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su",
            "/system/app/SuperSU.apk",
            "/system/app/SuperSU/SuperSU.apk",
        )
        return paths.any { File(it).exists() }
    }

    private fun checkBuildTags(): Boolean {
        val tags = Build.TAGS
        return tags != null && tags.contains("test-keys")
    }

    private fun checkDangerousProps(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", "ro.debuggable"))
            val result = process.inputStream.bufferedReader().readText().trim()
            result == "1"
        } catch (e: Exception) {
            false
        }
    }

    private fun checkSuExists(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("which", "su"))
            val result = process.inputStream.bufferedReader().readText().trim()
            result.isNotEmpty()
        } catch (e: Exception) {
            false
        }
    }

    private fun checkRWPaths(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("mount"))
            val output = process.inputStream.bufferedReader().readText()
            val lines = output.split("\n")
            lines.any { line ->
                line.contains("/system") && line.contains("rw")
            }
        } catch (e: Exception) {
            false
        }
    }
}
