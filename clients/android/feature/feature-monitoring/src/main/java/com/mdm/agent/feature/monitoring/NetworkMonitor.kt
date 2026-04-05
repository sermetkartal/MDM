package com.mdm.agent.feature.monitoring

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.telephony.TelephonyManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NetworkMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
    private val connectivityManager: ConnectivityManager,
) {
    fun getNetworkInfo(): NetworkInfo {
        val network = connectivityManager.activeNetwork
        val capabilities = network?.let { connectivityManager.getNetworkCapabilities(it) }

        val isConnected = capabilities != null &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)

        val type = when {
            capabilities == null -> "none"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }

        val wifiInfo = getWifiInfo()
        val cellInfo = getCellularInfo()

        return NetworkInfo(
            isConnected = isConnected,
            type = type,
            wifiSsid = wifiInfo?.ssid,
            wifiSignalStrength = wifiInfo?.signalStrength,
            cellularOperator = cellInfo?.operator,
            cellularType = cellInfo?.networkType,
            downstreamBandwidthKbps = capabilities?.linkDownstreamBandwidthKbps,
            upstreamBandwidthKbps = capabilities?.linkUpstreamBandwidthKbps,
        )
    }

    private fun getWifiInfo(): WifiInfo? {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val info = wifiManager.connectionInfo ?: return null
        if (info.networkId == -1) return null

        return WifiInfo(
            ssid = info.ssid?.removeSurrounding("\"") ?: "unknown",
            signalStrength = WifiManager.calculateSignalLevel(info.rssi, 5),
        )
    }

    private fun getCellularInfo(): CellularInfo? {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        val operator = tm.networkOperatorName
        if (operator.isNullOrEmpty()) return null

        return CellularInfo(
            operator = operator,
            networkType = mapNetworkType(tm.dataNetworkType),
        )
    }

    private fun mapNetworkType(type: Int): String = when (type) {
        TelephonyManager.NETWORK_TYPE_LTE -> "4G"
        TelephonyManager.NETWORK_TYPE_NR -> "5G"
        TelephonyManager.NETWORK_TYPE_HSDPA,
        TelephonyManager.NETWORK_TYPE_HSUPA,
        TelephonyManager.NETWORK_TYPE_HSPA -> "3G"
        TelephonyManager.NETWORK_TYPE_EDGE,
        TelephonyManager.NETWORK_TYPE_GPRS -> "2G"
        else -> "unknown"
    }

    data class NetworkInfo(
        val isConnected: Boolean,
        val type: String,
        val wifiSsid: String?,
        val wifiSignalStrength: Int?,
        val cellularOperator: String?,
        val cellularType: String?,
        val downstreamBandwidthKbps: Int?,
        val upstreamBandwidthKbps: Int?,
    )

    private data class WifiInfo(val ssid: String, val signalStrength: Int)
    private data class CellularInfo(val operator: String, val networkType: String)
}
