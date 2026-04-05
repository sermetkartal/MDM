package com.mdm.agent.core.network

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import org.eclipse.paho.client.mqttv3.*
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import timber.log.Timber
import java.util.Properties
import javax.inject.Inject
import javax.inject.Singleton
import javax.net.ssl.SSLSocketFactory

@Singleton
class MqttClient @Inject constructor(
    private val certificatePinning: CertificatePinning,
) {
    private var client: org.eclipse.paho.client.mqttv3.MqttAsyncClient? = null

    fun connect(
        serverUri: String,
        clientId: String,
        username: String? = null,
        password: String? = null,
    ) {
        val persistence = MemoryPersistence()
        client = MqttAsyncClient(serverUri, clientId, persistence)

        val options = MqttConnectOptions().apply {
            isCleanSession = false
            connectionTimeout = 30
            keepAliveInterval = 60
            isAutomaticReconnect = true
            maxInflight = 100

            if (username != null) {
                this.userName = username
            }
            if (password != null) {
                this.password = password.toCharArray()
            }

            val sslContext = certificatePinning.createSslContext()
            if (sslContext != null) {
                socketFactory = sslContext.socketFactory
            }
        }

        client?.connect(options, null, object : IMqttActionListener {
            override fun onSuccess(asyncActionToken: IMqttToken?) {
                Timber.d("MQTT connected to %s", serverUri)
            }

            override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
                Timber.e(exception, "MQTT connection failed to %s", serverUri)
            }
        })
    }

    fun subscribe(topic: String, qos: Int = 1): Flow<MqttMessage> = callbackFlow {
        val mqttClient = client ?: throw IllegalStateException("MQTT client not connected")

        mqttClient.subscribe(topic, qos, null, object : IMqttActionListener {
            override fun onSuccess(asyncActionToken: IMqttToken?) {
                Timber.d("Subscribed to topic: %s", topic)
            }

            override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
                Timber.e(exception, "Failed to subscribe to topic: %s", topic)
                close(exception)
            }
        }) { _, message ->
            trySend(message)
        }

        awaitClose {
            try {
                mqttClient.unsubscribe(topic)
            } catch (e: MqttException) {
                Timber.w(e, "Error unsubscribing from topic: %s", topic)
            }
        }
    }

    fun publish(topic: String, payload: ByteArray, qos: Int = 1, retained: Boolean = false) {
        val message = MqttMessage(payload).apply {
            this.qos = qos
            this.isRetained = retained
        }
        client?.publish(topic, message)
    }

    fun isConnected(): Boolean = client?.isConnected == true

    fun disconnect() {
        try {
            client?.disconnect()
            client?.close()
        } catch (e: MqttException) {
            Timber.w(e, "Error disconnecting MQTT client")
        }
        client = null
    }
}
