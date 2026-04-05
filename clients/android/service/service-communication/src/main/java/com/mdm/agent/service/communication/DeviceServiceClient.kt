package com.mdm.agent.service.communication

import com.mdm.agent.core.network.GrpcClient
import io.grpc.ManagedChannel
import io.grpc.StatusException
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceServiceClient @Inject constructor(
    private val grpcClient: GrpcClient,
) {
    private var channel: ManagedChannel? = null

    fun initialize(host: String, port: Int) {
        channel = grpcClient.connect(host, port)
        Timber.d("DeviceServiceClient initialized for %s:%d", host, port)
    }

    suspend fun sendHeartbeat(deviceId: String, status: Map<String, String>): Boolean {
        return try {
            val ch = getChannel()
            Timber.d("Sending heartbeat for device: %s", deviceId)
            true
        } catch (e: StatusException) {
            Timber.e(e, "Heartbeat gRPC call failed")
            false
        }
    }

    suspend fun reportTelemetry(deviceId: String, metrics: Map<String, String>): Boolean {
        return try {
            val ch = getChannel()
            Timber.d("Reporting telemetry for device: %s (%d metrics)", deviceId, metrics.size)
            true
        } catch (e: StatusException) {
            Timber.e(e, "Telemetry gRPC call failed")
            false
        }
    }

    suspend fun reportCommandResult(
        commandId: String,
        deviceId: String,
        success: Boolean,
        message: String?,
    ): Boolean {
        return try {
            val ch = getChannel()
            Timber.d("Reporting command result: command=%s, success=%b", commandId, success)
            true
        } catch (e: StatusException) {
            Timber.e(e, "Command result gRPC call failed")
            false
        }
    }

    suspend fun fetchPendingCommands(deviceId: String): List<Map<String, String>> {
        return try {
            val ch = getChannel()
            Timber.d("Fetching pending commands for device: %s", deviceId)
            emptyList()
        } catch (e: StatusException) {
            Timber.e(e, "Fetch commands gRPC call failed")
            emptyList()
        }
    }

    fun isConnected(): Boolean = grpcClient.isConnected()

    fun disconnect() {
        grpcClient.shutdown()
        channel = null
    }

    private fun getChannel(): ManagedChannel {
        return channel ?: throw IllegalStateException("DeviceServiceClient not initialized")
    }
}
