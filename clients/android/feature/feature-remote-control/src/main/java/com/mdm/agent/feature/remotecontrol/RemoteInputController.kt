package com.mdm.agent.feature.remotecontrol

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.graphics.Point
import android.os.SystemClock
import android.util.DisplayMetrics
import android.view.WindowManager
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Receives touch events from the admin console via WebRTC data channel
 * and injects them into the device screen.
 */
@Singleton
class RemoteInputController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var accessibilityService: AccessibilityService? = null
    private var screenWidth: Int = 0
    private var screenHeight: Int = 0
    private var isEnabled = false

    fun initialize(service: AccessibilityService) {
        this.accessibilityService = service
        updateScreenDimensions()
        Timber.d("RemoteInputController initialized: screen=%dx%d", screenWidth, screenHeight)
    }

    fun setEnabled(enabled: Boolean) {
        isEnabled = enabled
        Timber.d("Remote input %s", if (enabled) "enabled" else "disabled")
    }

    private fun updateScreenDimensions() {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        screenWidth = metrics.widthPixels
        screenHeight = metrics.heightPixels
    }

    /**
     * Handle a touch event message from the admin console data channel.
     * Expected JSON format:
     * {
     *   "type": "tap" | "long_press" | "swipe" | "pinch",
     *   "x": 0.5,          // normalized 0.0-1.0
     *   "y": 0.5,          // normalized 0.0-1.0
     *   "endX": 0.8,       // for swipe
     *   "endY": 0.8,       // for swipe
     *   "duration": 500,    // ms
     *   "scale": 1.5,       // for pinch
     *   "viewportWidth": 1280,
     *   "viewportHeight": 720
     * }
     */
    fun handleTouchEvent(jsonData: String) {
        if (!isEnabled) return

        try {
            val json = JSONObject(jsonData)
            val type = json.getString("type")

            when (type) {
                "tap" -> handleTap(json)
                "long_press" -> handleLongPress(json)
                "swipe" -> handleSwipe(json)
                "pinch" -> handlePinch(json)
                else -> Timber.w("Unknown touch event type: %s", type)
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to handle touch event")
        }
    }

    private fun handleTap(json: JSONObject) {
        val point = translateCoordinates(json)
        Timber.d("Tap at device coords: %d, %d", point.x, point.y)

        dispatchGesture(
            createTapGesture(point.x.toFloat(), point.y.toFloat(), 50L)
        )
    }

    private fun handleLongPress(json: JSONObject) {
        val point = translateCoordinates(json)
        val duration = json.optLong("duration", 1000L)
        Timber.d("Long press at: %d, %d for %dms", point.x, point.y, duration)

        dispatchGesture(
            createTapGesture(point.x.toFloat(), point.y.toFloat(), duration)
        )
    }

    private fun handleSwipe(json: JSONObject) {
        val startPoint = translateCoordinates(json)
        val endX = json.getDouble("endX")
        val endY = json.getDouble("endY")
        val endPoint = Point(
            (endX * screenWidth).toInt().coerceIn(0, screenWidth),
            (endY * screenHeight).toInt().coerceIn(0, screenHeight),
        )
        val duration = json.optLong("duration", 300L)

        Timber.d("Swipe from (%d,%d) to (%d,%d)", startPoint.x, startPoint.y, endPoint.x, endPoint.y)

        val path = Path().apply {
            moveTo(startPoint.x.toFloat(), startPoint.y.toFloat())
            lineTo(endPoint.x.toFloat(), endPoint.y.toFloat())
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0L, duration))
            .build()

        dispatchGesture(gesture)
    }

    private fun handlePinch(json: JSONObject) {
        val center = translateCoordinates(json)
        val scale = json.getDouble("scale").toFloat()
        val duration = json.optLong("duration", 400L)

        Timber.d("Pinch at (%d,%d) scale=%.2f", center.x, center.y, scale)

        // Simulate pinch with two finger paths
        val offset = 100f
        val startOffset = if (scale > 1f) offset else offset * scale
        val endOffset = if (scale > 1f) offset * scale else offset

        val path1 = Path().apply {
            moveTo(center.x - startOffset, center.y.toFloat())
            lineTo(center.x - endOffset, center.y.toFloat())
        }
        val path2 = Path().apply {
            moveTo(center.x + startOffset, center.y.toFloat())
            lineTo(center.x + endOffset, center.y.toFloat())
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path1, 0L, duration))
            .addStroke(GestureDescription.StrokeDescription(path2, 0L, duration))
            .build()

        dispatchGesture(gesture)
    }

    /**
     * Translate normalized coordinates (0.0-1.0) from admin viewport to device screen coordinates.
     */
    private fun translateCoordinates(json: JSONObject): Point {
        val normalizedX = json.getDouble("x")
        val normalizedY = json.getDouble("y")

        val deviceX = (normalizedX * screenWidth).toInt().coerceIn(0, screenWidth)
        val deviceY = (normalizedY * screenHeight).toInt().coerceIn(0, screenHeight)

        return Point(deviceX, deviceY)
    }

    private fun createTapGesture(x: Float, y: Float, duration: Long): GestureDescription {
        val path = Path().apply {
            moveTo(x, y)
        }
        return GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0L, duration))
            .build()
    }

    private fun dispatchGesture(gesture: GestureDescription) {
        val service = accessibilityService
        if (service == null) {
            Timber.e("AccessibilityService not available for gesture dispatch")
            return
        }

        service.dispatchGesture(
            gesture,
            object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription) {
                    Timber.d("Gesture dispatched successfully")
                }

                override fun onCancelled(gestureDescription: GestureDescription) {
                    Timber.w("Gesture was cancelled")
                }
            },
            null,
        )
    }
}
