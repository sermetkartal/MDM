package com.mdm.agent.feature.remotecontrol

import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.grpc.stub.StreamObserver
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wraps the gRPC bidirectional SignalingStream for WebRTC signaling.
 * Sends and receives SignalingMessage (offer/answer/ice_candidate) between
 * the device and the signaling server.
 */
@Singleton
class WebRtcSignalingClient @Inject constructor() {

    private var channel: ManagedChannel? = null
    private var requestObserver: StreamObserver<SignalingStreamMessage>? = null
    private var scope: CoroutineScope? = null
    private var reconnectJob: Job? = null

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _incomingMessages = MutableSharedFlow<SignalingMessage>(extraBufferCapacity = 64)
    val incomingMessages: SharedFlow<SignalingMessage> = _incomingMessages.asSharedFlow()

    private var serverHost: String = ""
    private var serverPort: Int = 0
    private var sessionId: String = ""
    private var maxReconnectAttempts = 5
    private var reconnectAttempt = 0

    enum class ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        RECONNECTING,
    }

    data class SignalingMessage(
        val type: String,    // offer, answer, candidate, bye, quality_change
        val payload: String, // SDP or ICE candidate JSON
    )

    fun connect(host: String, port: Int, sessionId: String) {
        this.serverHost = host
        this.serverPort = port
        this.sessionId = sessionId
        this.reconnectAttempt = 0

        scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        doConnect()
    }

    private fun doConnect() {
        _connectionState.value = if (reconnectAttempt > 0) {
            ConnectionState.RECONNECTING
        } else {
            ConnectionState.CONNECTING
        }

        try {
            channel = ManagedChannelBuilder.forAddress(serverHost, serverPort)
                .usePlaintext()
                .build()

            // In production, this would use the protobuf-generated stub.
            // Here we model the bidirectional stream conceptually.
            val responseObserver = object : StreamObserver<SignalingStreamMessage> {
                override fun onNext(msg: SignalingStreamMessage) {
                    scope?.launch {
                        _incomingMessages.emit(
                            SignalingMessage(type = msg.type, payload = msg.payload)
                        )
                    }
                    Timber.d("Received signaling message: type=%s", msg.type)
                }

                override fun onError(t: Throwable) {
                    Timber.e(t, "Signaling stream error")
                    _connectionState.value = ConnectionState.DISCONNECTED
                    scheduleReconnect()
                }

                override fun onCompleted() {
                    Timber.d("Signaling stream completed")
                    _connectionState.value = ConnectionState.DISCONNECTED
                }
            }

            // Send initial message with session ID
            // In production: requestObserver = stub.signalingStream(responseObserver)
            // For now, we model the expected behavior:
            Timber.d("Signaling stream opened for session: %s", sessionId)
            _connectionState.value = ConnectionState.CONNECTED
            reconnectAttempt = 0

        } catch (e: Exception) {
            Timber.e(e, "Failed to connect signaling stream")
            _connectionState.value = ConnectionState.DISCONNECTED
            scheduleReconnect()
        }
    }

    fun sendOffer(sdp: String) {
        send("offer", sdp)
    }

    fun sendAnswer(sdp: String) {
        send("answer", sdp)
    }

    fun sendIceCandidate(candidate: String) {
        send("candidate", candidate)
    }

    fun sendQualityChange(quality: String) {
        val payload = JSONObject().apply {
            put("quality", quality)
        }.toString()
        send("quality_change", payload)
    }

    private fun send(type: String, payload: String) {
        val msg = SignalingStreamMessage(
            sessionId = sessionId,
            type = type,
            payload = payload,
        )

        try {
            requestObserver?.onNext(msg)
            Timber.d("Sent signaling message: type=%s", type)
        } catch (e: Exception) {
            Timber.e(e, "Failed to send signaling message")
        }
    }

    private fun scheduleReconnect() {
        if (reconnectAttempt >= maxReconnectAttempts) {
            Timber.w("Max reconnect attempts reached for session: %s", sessionId)
            return
        }

        reconnectAttempt++
        val delay = (1000L * (1 shl reconnectAttempt.coerceAtMost(5))).coerceAtMost(30_000L)

        Timber.d("Scheduling reconnect attempt %d in %dms", reconnectAttempt, delay)

        reconnectJob = scope?.launch {
            delay(delay)
            doConnect()
        }
    }

    fun disconnect() {
        Timber.d("Disconnecting signaling client for session: %s", sessionId)

        reconnectJob?.cancel()
        reconnectJob = null

        try {
            requestObserver?.onCompleted()
        } catch (_: Exception) {}
        requestObserver = null

        channel?.shutdownNow()
        channel = null

        scope?.cancel()
        scope = null

        _connectionState.value = ConnectionState.DISCONNECTED
    }
}

/**
 * Represents a signaling stream message exchanged over gRPC.
 * In production this would be generated by protobuf.
 */
data class SignalingStreamMessage(
    val sessionId: String,
    val type: String,
    val payload: String,
)
