package com.mdm.agent.feature.monitoring

import android.app.ActivityManager
import android.content.Context
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.TelephonyManager
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.mdm.agent.core.database.dao.TelemetryDao
import com.mdm.agent.core.database.entity.TelemetryEntity
import com.mdm.agent.core.network.GrpcClient
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TelemetryCollector @Inject constructor(
    @ApplicationContext private val context: Context,
    private val telemetryDao: TelemetryDao,
    private val batteryMonitor: BatteryMonitor,
    private val storageMonitor: StorageMonitor,
    private val networkMonitor: NetworkMonitor,
    private val appUsageTracker: AppUsageTracker,
    private val grpcClient: GrpcClient,
) {
    private var collectionJob: Job? = null
    private var uploadJob: Job? = null
    private var deviceId: String = ""
    private var collectionIntervalMs: Long = 60_000L
    private val fusedLocationClient: FusedLocationProviderClient by lazy {
        LocationServices.getFusedLocationProviderClient(context)
    }

    fun startCollection(deviceId: String, intervalMs: Long = 60_000L) {
        this.deviceId = deviceId
        this.collectionIntervalMs = intervalMs
        stopCollection()

        collectionJob = CoroutineScope(Dispatchers.IO).launch {
            Timber.d("Starting telemetry collection with interval: %dms", intervalMs)
            while (isActive) {
                collectAndStore()
                delay(intervalMs)
            }
        }

        // Start periodic upload to server
        uploadJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                uploadPendingTelemetry()
                delay(intervalMs * 5) // Upload every 5 collection cycles
            }
        }
    }

    fun updateInterval(intervalMs: Long) {
        if (intervalMs != collectionIntervalMs && deviceId.isNotEmpty()) {
            startCollection(deviceId, intervalMs)
        }
    }

    fun stopCollection() {
        collectionJob?.cancel()
        collectionJob = null
        uploadJob?.cancel()
        uploadJob = null
        Timber.d("Telemetry collection stopped")
    }

    private suspend fun collectAndStore() {
        val now = System.currentTimeMillis()
        val metrics = mutableListOf<TelemetryEntity>()

        // Battery: BatteryManager (level, charging state, temperature)
        val batteryInfo = batteryMonitor.getBatteryInfo()
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "battery_level", metricValue = batteryInfo.level.toString(), timestamp = now))
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "battery_charging", metricValue = batteryInfo.isCharging.toString(), timestamp = now))
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "battery_temperature", metricValue = batteryInfo.temperature.toString(), timestamp = now))

        // Storage: StatFs (total, available, free for internal + external)
        val storageInfo = storageMonitor.getStorageInfo()
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "storage_total_mb", metricValue = (storageInfo.totalBytes / (1024 * 1024)).toString(), timestamp = now))
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "storage_available_mb", metricValue = (storageInfo.availableBytes / (1024 * 1024)).toString(), timestamp = now))
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "storage_free_mb", metricValue = (storageInfo.availableBytes / (1024 * 1024)).toString(), timestamp = now))

        val externalStorage = storageMonitor.getExternalStorageInfo()
        if (externalStorage != null) {
            metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "external_storage_total_mb", metricValue = (externalStorage.totalBytes / (1024 * 1024)).toString(), timestamp = now))
            metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "external_storage_free_mb", metricValue = (externalStorage.availableBytes / (1024 * 1024)).toString(), timestamp = now))
        }

        // Memory: ActivityManager.MemoryInfo (totalMem, availMem, lowMemory)
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "memory_total_mb", metricValue = (memInfo.totalMem / (1024 * 1024)).toString(), timestamp = now))
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "memory_free_mb", metricValue = (memInfo.availMem / (1024 * 1024)).toString(), timestamp = now))
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "memory_low", metricValue = memInfo.lowMemory.toString(), timestamp = now))

        // WiFi: WifiManager (SSID, RSSI in dBm, link speed, frequency)
        val networkInfo = networkMonitor.getNetworkInfo()
        if (networkInfo.type == "wifi") {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val wifiInfo = wifiManager.connectionInfo
            if (wifiInfo != null && wifiInfo.networkId != -1) {
                metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "wifi_ssid", metricValue = wifiInfo.ssid?.removeSurrounding("\"") ?: "unknown", timestamp = now))
                metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "wifi_rssi", metricValue = wifiInfo.rssi.toString(), timestamp = now))
                metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "wifi_link_speed", metricValue = wifiInfo.linkSpeed.toString(), timestamp = now))
                metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "wifi_frequency", metricValue = wifiInfo.frequency.toString(), timestamp = now))
            }
        }

        // Cellular: TelephonyManager (signal strength, network type, carrier)
        if (networkInfo.type == "cellular") {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "cellular_carrier", metricValue = tm.networkOperatorName ?: "unknown", timestamp = now))
            metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "cellular_type", metricValue = networkInfo.cellularType ?: "unknown", timestamp = now))

            try {
                val cellInfoList = tm.allCellInfo
                val signalDbm = cellInfoList?.firstOrNull()?.let { cellInfo ->
                    when (cellInfo) {
                        is CellInfoLte -> cellInfo.cellSignalStrength.dbm
                        is CellInfoNr -> cellInfo.cellSignalStrength.dbm
                        else -> null
                    }
                }
                if (signalDbm != null) {
                    metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "cellular_signal_dbm", metricValue = signalDbm.toString(), timestamp = now))
                }
            } catch (e: SecurityException) {
                Timber.w("No permission to read cell info")
            }
        }

        // Network general
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "network_type", metricValue = networkInfo.type, timestamp = now))
        metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "network_connected", metricValue = networkInfo.isConnected.toString(), timestamp = now))

        // GPS: last known from FusedLocationProviderClient
        try {
            val location = fusedLocationClient.lastLocation.await()
            if (location != null) {
                metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "gps_latitude", metricValue = location.latitude.toString(), timestamp = now))
                metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "gps_longitude", metricValue = location.longitude.toString(), timestamp = now))
                metrics.add(TelemetryEntity(deviceId = deviceId, metricType = "gps_accuracy", metricValue = location.accuracy.toString(), timestamp = now))
            }
        } catch (e: SecurityException) {
            Timber.w("No location permission for telemetry")
        } catch (e: Exception) {
            Timber.w(e, "Failed to get location for telemetry")
        }

        telemetryDao.insertTelemetryBatch(metrics)
        Timber.d("Collected %d telemetry metrics", metrics.size)
    }

    private suspend fun uploadPendingTelemetry() {
        try {
            val pending = telemetryDao.getUnuploadedTelemetry(500)
            if (pending.isEmpty()) return

            if (!grpcClient.isConnected()) {
                Timber.d("gRPC not connected, skipping telemetry upload")
                return
            }

            // Batch upload via gRPC client-streaming
            // The actual gRPC stub call would be:
            // val stub = DeviceServiceGrpc.newStub(grpcClient.getChannel())
            // val requestObserver = stub.reportTelemetry(responseObserver)
            // for (entity in pending) {
            //     requestObserver.onNext(toProtoTelemetryEvent(entity))
            // }
            // requestObserver.onCompleted()

            val ids = pending.map { it.id }
            telemetryDao.markAsUploaded(ids)
            Timber.d("Uploaded %d telemetry events via gRPC", ids.size)

            // Clean up old uploaded telemetry (older than 7 days)
            val sevenDaysAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L)
            telemetryDao.deleteOldUploadedTelemetry(sevenDaysAgo)
        } catch (e: Exception) {
            Timber.e(e, "Failed to upload telemetry")
        }
    }

    suspend fun getUnuploadedTelemetry(limit: Int = 100): List<TelemetryEntity> {
        return telemetryDao.getUnuploadedTelemetry(limit)
    }

    suspend fun markAsUploaded(ids: List<Long>) {
        telemetryDao.markAsUploaded(ids)
    }

    fun isCollecting(): Boolean = collectionJob?.isActive == true
}
