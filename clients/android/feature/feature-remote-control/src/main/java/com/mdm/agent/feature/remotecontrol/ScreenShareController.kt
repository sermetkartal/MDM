package com.mdm.agent.feature.remotecontrol

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import android.util.DisplayMetrics
import android.view.Surface
import android.view.WindowManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.webrtc.*
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

enum class StreamQuality(
    val width: Int,
    val height: Int,
    val fps: Int,
    val bitrate: Int,
) {
    LOW(640, 360, 15, 500_000),
    MEDIUM(1280, 720, 24, 1_500_000),
    HIGH(1920, 1080, 30, 3_000_000),
}

@Singleton
class ScreenShareController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var mediaCodec: MediaCodec? = null
    private var encoderSurface: Surface? = null
    private var encoderThread: HandlerThread? = null
    private var peerConnection: PeerConnection? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var videoTrack: VideoTrack? = null
    private var videoSource: VideoSource? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var dataChannel: DataChannel? = null

    private val _isCapturing = MutableStateFlow(false)
    val isCapturing: StateFlow<Boolean> = _isCapturing.asStateFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private var currentQuality = StreamQuality.MEDIUM
    private var signalingClient: WebRtcSignalingClient? = null

    var onIceCandidate: ((IceCandidate) -> Unit)? = null
    var onDataChannelMessage: ((String) -> Unit)? = null

    enum class ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
    }

    fun initialize() {
        val options = PeerConnectionFactory.InitializationOptions.builder(context)
            .setEnableInternalTracer(false)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)

        val encoderFactory = DefaultVideoEncoderFactory(
            EglBase.create().eglBaseContext, true, true
        )
        val decoderFactory = DefaultVideoDecoderFactory(EglBase.create().eglBaseContext)

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        Timber.d("WebRTC PeerConnectionFactory initialized")
    }

    fun startCapture(
        quality: StreamQuality = StreamQuality.MEDIUM,
        iceServers: List<PeerConnection.IceServer>,
        signalingClient: WebRtcSignalingClient,
    ) {
        if (_isCapturing.value) {
            Timber.w("Screen capture already in progress")
            return
        }

        this.currentQuality = quality
        this.signalingClient = signalingClient
        _connectionState.value = ConnectionState.CONNECTING

        Timber.d("Starting screen capture: quality=%s", quality.name)

        setupPeerConnection(iceServers)
        setupMediaProjectionCapture(quality)

        _isCapturing.value = true
    }

    private fun setupPeerConnection(iceServers: List<PeerConnection.IceServer>) {
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(
            rtcConfig,
            object : PeerConnection.Observer {
                override fun onIceCandidate(candidate: IceCandidate) {
                    Timber.d("ICE candidate generated: %s", candidate.sdpMid)
                    onIceCandidate?.invoke(candidate)
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                    Timber.d("ICE connection state: %s", state)
                    when (state) {
                        PeerConnection.IceConnectionState.CONNECTED -> {
                            _connectionState.value = ConnectionState.CONNECTED
                        }
                        PeerConnection.IceConnectionState.DISCONNECTED,
                        PeerConnection.IceConnectionState.FAILED,
                        PeerConnection.IceConnectionState.CLOSED -> {
                            _connectionState.value = ConnectionState.DISCONNECTED
                        }
                        else -> {}
                    }
                }

                override fun onDataChannel(dc: DataChannel) {
                    Timber.d("Data channel received: %s", dc.label())
                    dataChannel = dc
                    dc.registerObserver(object : DataChannel.Observer {
                        override fun onBufferedAmountChange(amount: Long) {}
                        override fun onStateChange() {
                            Timber.d("Data channel state: %s", dc.state())
                        }
                        override fun onMessage(buffer: DataChannel.Buffer) {
                            val data = ByteArray(buffer.data.remaining())
                            buffer.data.get(data)
                            val message = String(data, Charsets.UTF_8)
                            onDataChannelMessage?.invoke(message)
                        }
                    })
                }

                override fun onSignalingChange(state: PeerConnection.SignalingState) {}
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
                override fun onRemoveStream(stream: MediaStream) {}
                override fun onAddStream(stream: MediaStream) {}
                override fun onRenegotiationNeeded() {}
                override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {}
            }
        )
    }

    private fun setupMediaProjectionCapture(quality: StreamQuality) {
        val projection = mediaProjection ?: run {
            Timber.e("MediaProjection not set")
            return
        }

        val eglBase = EglBase.create()
        surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)

        videoSource = peerConnectionFactory?.createVideoSource(true)
        videoTrack = peerConnectionFactory?.createVideoTrack("screen_track", videoSource)

        videoTrack?.let { track ->
            peerConnection?.addTrack(track, listOf("screen_stream"))
        }

        // Create a ScreenCapturerAndroid from the MediaProjection
        val videoCapturer = createScreenCapturer(projection)
        videoCapturer?.initialize(surfaceTextureHelper, context, videoSource?.capturerObserver)
        videoCapturer?.startCapture(quality.width, quality.height, quality.fps)

        Timber.d("Media capture started: %dx%d @ %dfps, %dkbps",
            quality.width, quality.height, quality.fps, quality.bitrate / 1000)
    }

    private fun createScreenCapturer(projection: MediaProjection): VideoCapturer? {
        return ScreenCapturerAndroid(projection, object : MediaProjection.Callback() {
            override fun onStop() {
                Timber.d("MediaProjection stopped")
                stopCapture()
            }
        })
    }

    fun handleRemoteAnswer(sdp: SessionDescription) {
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                Timber.d("Remote description set successfully")
            }
            override fun onSetFailure(error: String) {
                Timber.e("Failed to set remote description: %s", error)
            }
            override fun onCreateSuccess(sdp: SessionDescription) {}
            override fun onCreateFailure(error: String) {}
        }, sdp)
    }

    fun createOffer(callback: (SessionDescription) -> Unit) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
        }

        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription) {
                peerConnection?.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        Timber.d("Local description set")
                        callback(sdp)
                    }
                    override fun onSetFailure(error: String) {
                        Timber.e("Failed to set local description: %s", error)
                    }
                    override fun onCreateSuccess(sdp: SessionDescription) {}
                    override fun onCreateFailure(error: String) {}
                }, sdp)
            }
            override fun onCreateFailure(error: String) {
                Timber.e("Failed to create offer: %s", error)
            }
            override fun onSetSuccess() {}
            override fun onSetFailure(error: String) {}
        }, constraints)
    }

    fun addIceCandidate(candidate: IceCandidate) {
        peerConnection?.addIceCandidate(candidate)
    }

    fun setQuality(quality: StreamQuality) {
        if (quality == currentQuality) return
        currentQuality = quality
        Timber.d("Quality changed to: %s", quality.name)
        // Adjust encoder parameters - in a full implementation this would
        // reconfigure the video source resolution and bitrate
        videoTrack?.let { track ->
            val sender = peerConnection?.senders?.find { it.track()?.id() == track.id() }
            sender?.let { s ->
                val params = s.parameters
                params.encodings?.firstOrNull()?.let { encoding ->
                    encoding.maxBitrateBps = quality.bitrate
                    encoding.maxFramerate = quality.fps
                }
                s.parameters = params
            }
        }
    }

    fun stopCapture() {
        Timber.d("Stopping screen capture")

        dataChannel?.close()
        dataChannel = null

        videoTrack?.dispose()
        videoTrack = null

        videoSource?.dispose()
        videoSource = null

        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null

        peerConnection?.close()
        peerConnection = null

        mediaCodec?.stop()
        mediaCodec?.release()
        mediaCodec = null

        encoderSurface?.release()
        encoderSurface = null

        encoderThread?.quitSafely()
        encoderThread = null

        virtualDisplay?.release()
        virtualDisplay = null

        mediaProjection?.stop()
        mediaProjection = null

        signalingClient = null

        _isCapturing.value = false
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    fun setMediaProjection(projection: MediaProjection) {
        this.mediaProjection = projection
    }

    fun dispose() {
        stopCapture()
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
    }
}
