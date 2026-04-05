package com.mdm.agent.core.common.extensions

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs

fun Context.isDeviceOwner(adminComponent: ComponentName): Boolean {
    val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    return dpm.isDeviceOwnerApp(packageName)
}

fun Context.isProfileOwner(adminComponent: ComponentName): Boolean {
    val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    return dpm.isProfileOwnerApp(packageName)
}

fun Context.isNetworkAvailable(): Boolean {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.activeNetwork ?: return false
    val capabilities = cm.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}

fun Context.getBatteryLevel(): Int {
    val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
}

fun Context.isCharging(): Boolean {
    val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    return bm.isCharging
}

fun Context.getAvailableStorageBytes(): Long {
    val stat = StatFs(Environment.getDataDirectory().path)
    return stat.availableBlocksLong * stat.blockSizeLong
}

fun Context.getTotalStorageBytes(): Long {
    val stat = StatFs(Environment.getDataDirectory().path)
    return stat.totalBytes
}

fun Context.getDeviceInfo(): Map<String, String> = mapOf(
    "manufacturer" to Build.MANUFACTURER,
    "model" to Build.MODEL,
    "device" to Build.DEVICE,
    "sdk_version" to Build.VERSION.SDK_INT.toString(),
    "release" to Build.VERSION.RELEASE,
    "serial" to (Build.getSerial() ?: "unknown"),
    "build_id" to Build.ID,
)

fun Context.isAppInstalled(packageName: String): Boolean {
    return try {
        packageManager.getPackageInfo(packageName, PackageManager.GET_META_DATA)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }
}
