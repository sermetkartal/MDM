package com.mdm.agent.service.agent

import com.mdm.agent.core.common.Constants
import com.mdm.agent.core.database.dao.DeviceDao
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HeartbeatManager @Inject constructor(
    private val deviceDao: DeviceDao,
) {
    private var heartbeatJob: Job? = null
    private var intervalMs: Long = Constants.DEFAULT_HEARTBEAT_INTERVAL_MS

    fun startHeartbeat(customIntervalMs: Long? = null) {
        intervalMs = customIntervalMs ?: Constants.DEFAULT_HEARTBEAT_INTERVAL_MS
        stopHeartbeat()

        heartbeatJob = CoroutineScope(Dispatchers.IO).launch {
            Timber.d("Heartbeat started with interval: %dms", intervalMs)
            while (isActive) {
                sendHeartbeat()
                delay(intervalMs)
            }
        }
    }

    fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        Timber.d("Heartbeat stopped")
    }

    private suspend fun sendHeartbeat() {
        try {
            val device = deviceDao.getDevice() ?: return
            val now = System.currentTimeMillis()

            deviceDao.updateLastCheckIn(device.deviceId, now)

            Timber.d("Heartbeat sent for device: %s", device.deviceId)
        } catch (e: Exception) {
            Timber.e(e, "Failed to send heartbeat")
        }
    }

    fun isRunning(): Boolean = heartbeatJob?.isActive == true

    fun setInterval(intervalMs: Long) {
        this.intervalMs = intervalMs
        if (isRunning()) {
            startHeartbeat(intervalMs)
        }
    }
}
