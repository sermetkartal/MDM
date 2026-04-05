package com.mdm.agent.feature.remotecontrol

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteControlManager @Inject constructor(
    private val screenShareController: ScreenShareController,
    private val remoteInputController: RemoteInputController,
    private val signalingClient: WebRtcSignalingClient,
    private val remoteShellController: RemoteShellController,
    private val fileManagerController: FileManagerController,
    private val deviceActionController: DeviceActionController,
) {
    private val _activeSession = MutableStateFlow<RemoteSession?>(null)
    val activeSession: StateFlow<RemoteSession?> = _activeSession.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    fun startSession(sessionId: String, type: SessionType) {
        Timber.d("Starting remote control session: id=%s, type=%s", sessionId, type)
        _activeSession.value = RemoteSession(sessionId, type, System.currentTimeMillis())

        when (type) {
            SessionType.SCREEN_SHARE -> startScreenShareSession(sessionId)
            SessionType.REMOTE_SHELL -> remoteShellController.startShell()
            SessionType.FILE_MANAGER -> fileManagerController.startSession()
        }
    }

    private fun startScreenShareSession(sessionId: String) {
        screenShareController.initialize()

        // Set up data channel message handling for remote input
        screenShareController.onDataChannelMessage = { message ->
            remoteInputController.handleTouchEvent(message)
        }

        // Set up ICE candidate forwarding
        screenShareController.onIceCandidate = { candidate ->
            val json = JSONObject().apply {
                put("sdpMid", candidate.sdpMid)
                put("sdpMLineIndex", candidate.sdpMLineIndex)
                put("sdp", candidate.sdp)
            }
            signalingClient.sendIceCandidate(json.toString())
        }

        // Listen for incoming signaling messages
        scope.launch {
            signalingClient.incomingMessages.collect { msg ->
                handleSignalingMessage(msg)
            }
        }
    }

    private fun handleSignalingMessage(msg: WebRtcSignalingClient.SignalingMessage) {
        when (msg.type) {
            "offer" -> {
                // Device receives offer from admin, creates answer
                val sdp = SessionDescription(SessionDescription.Type.OFFER, msg.payload)
                screenShareController.handleRemoteAnswer(sdp)
            }
            "answer" -> {
                val sdp = SessionDescription(SessionDescription.Type.ANSWER, msg.payload)
                screenShareController.handleRemoteAnswer(sdp)
            }
            "candidate" -> {
                try {
                    val json = JSONObject(msg.payload)
                    val candidate = IceCandidate(
                        json.getString("sdpMid"),
                        json.getInt("sdpMLineIndex"),
                        json.getString("sdp"),
                    )
                    screenShareController.addIceCandidate(candidate)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to parse ICE candidate")
                }
            }
            "quality_change" -> {
                try {
                    val json = JSONObject(msg.payload)
                    val quality = when (json.getString("quality")) {
                        "low" -> StreamQuality.LOW
                        "high" -> StreamQuality.HIGH
                        else -> StreamQuality.MEDIUM
                    }
                    screenShareController.setQuality(quality)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to parse quality change")
                }
            }
            "bye" -> {
                endSession()
            }
        }
    }

    fun startScreenShare(
        sessionId: String,
        serverHost: String,
        serverPort: Int,
        iceServers: List<PeerConnection.IceServer>,
        quality: StreamQuality = StreamQuality.MEDIUM,
    ) {
        startSession(sessionId, SessionType.SCREEN_SHARE)

        signalingClient.connect(serverHost, serverPort, sessionId)
        remoteInputController.setEnabled(true)

        screenShareController.startCapture(
            quality = quality,
            iceServers = iceServers,
            signalingClient = signalingClient,
        )

        // Create offer once capture is started
        screenShareController.createOffer { sdp ->
            signalingClient.sendOffer(sdp.description)
        }
    }

    fun endSession() {
        val session = _activeSession.value ?: return
        Timber.d("Ending remote control session: %s", session.sessionId)

        when (session.type) {
            SessionType.SCREEN_SHARE -> {
                remoteInputController.setEnabled(false)
                screenShareController.stopCapture()
                signalingClient.disconnect()
            }
            SessionType.REMOTE_SHELL -> remoteShellController.stopShell()
            SessionType.FILE_MANAGER -> fileManagerController.endSession()
        }

        _activeSession.value = null
    }

    fun hasActiveSession(): Boolean = _activeSession.value != null

    data class RemoteSession(
        val sessionId: String,
        val type: SessionType,
        val startedAt: Long,
    )

    enum class SessionType {
        SCREEN_SHARE,
        REMOTE_SHELL,
        FILE_MANAGER,
    }
}
