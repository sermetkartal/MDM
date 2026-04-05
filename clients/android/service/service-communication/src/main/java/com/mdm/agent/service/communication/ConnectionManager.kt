package com.mdm.agent.service.communication

import android.content.Context
import com.mdm.agent.core.network.GrpcClient
import com.mdm.agent.core.network.MqttClient
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConnectionManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val grpcClient: GrpcClient,
    private val mqttClient: MqttClient,
    private val deviceServiceClient: DeviceServiceClient,
) {
    private val _events = MutableSharedFlow<ConnectionEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<ConnectionEvent> = _events.asSharedFlow()

    private var fcmToken: String? = null

    fun connectToServer(host: String, port: Int) {
        grpcClient.connect(host, port)
        deviceServiceClient.initialize(host, port)
        Timber.d("Connected to server: %s:%d", host, port)
    }

    fun connectMqtt(serverUri: String, clientId: String) {
        mqttClient.connect(serverUri, clientId)
        Timber.d("MQTT connected to: %s", serverUri)
    }

    fun disconnect() {
        grpcClient.shutdown()
        mqttClient.disconnect()
        Timber.d("Disconnected from all servers")
    }

    fun isConnected(): Boolean {
        return grpcClient.isConnected() || mqttClient.isConnected()
    }

    fun onFcmTokenRefreshed(token: String) {
        fcmToken = token
        _events.tryEmit(ConnectionEvent.FcmTokenRefreshed(token))
    }

    fun onCommandReceived(commandId: String, commandType: String, payload: String?) {
        _events.tryEmit(ConnectionEvent.CommandReceived(commandId, commandType, payload))
    }

    fun onPolicyUpdateAvailable(version: Long) {
        _events.tryEmit(ConnectionEvent.PolicyUpdateAvailable(version))
    }

    fun onWakeReceived() {
        _events.tryEmit(ConnectionEvent.WakeReceived)
    }

    fun getFcmToken(): String? = fcmToken

    sealed class ConnectionEvent {
        data class FcmTokenRefreshed(val token: String) : ConnectionEvent()
        data class CommandReceived(
            val commandId: String,
            val commandType: String,
            val payload: String?,
        ) : ConnectionEvent()
        data class PolicyUpdateAvailable(val version: Long) : ConnectionEvent()
        data object WakeReceived : ConnectionEvent()
    }
}
