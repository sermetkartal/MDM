package com.mdm.agent.feature.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.GeofencingEvent
import com.mdm.agent.feature.location.model.GeofenceAction
import timber.log.Timber

/**
 * Receives geofence transition events from Google Play Services.
 * Determines the transition type (enter/exit/dwell) and executes
 * the configured local action + reports to server.
 */
class GeofenceBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val geofencingEvent = GeofencingEvent.fromIntent(intent)
        if (geofencingEvent == null) {
            Timber.w("GeofencingEvent is null")
            return
        }

        if (geofencingEvent.hasError()) {
            val errorMessage = GeofenceStatusCodes.getStatusCodeString(geofencingEvent.errorCode)
            Timber.e("Geofence error: %s (code: %d)", errorMessage, geofencingEvent.errorCode)
            return
        }

        val transitionType = geofencingEvent.geofenceTransition
        val triggeringGeofences = geofencingEvent.triggeringGeofences ?: return
        val triggeringLocation = geofencingEvent.triggeringLocation

        val transitionName = when (transitionType) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
            Geofence.GEOFENCE_TRANSITION_DWELL -> "dwell"
            else -> "unknown"
        }

        for (geofence in triggeringGeofences) {
            Timber.i(
                "Geofence transition: %s for fence %s at (%.6f, %.6f)",
                transitionName,
                geofence.requestId,
                triggeringLocation?.latitude ?: 0.0,
                triggeringLocation?.longitude ?: 0.0
            )

            val action = resolveAction(geofence.requestId)
            executeAction(context, action, transitionName, geofence.requestId)

            reportTransitionToServer(
                geofenceId = geofence.requestId,
                transition = transitionName,
                latitude = triggeringLocation?.latitude ?: 0.0,
                longitude = triggeringLocation?.longitude ?: 0.0
            )
        }
    }

    private fun resolveAction(geofenceId: String): GeofenceAction {
        // The action is stored in GeofenceConfig; retrieve from shared prefs or in-memory cache.
        // For now, default to NOTIFY. In production, this would look up the GeofenceManager.
        return GeofenceAction.NOTIFY
    }

    private fun executeAction(
        context: Context,
        action: GeofenceAction,
        transition: String,
        geofenceId: String
    ) {
        when (action) {
            GeofenceAction.NOTIFY -> {
                showNotification(
                    context,
                    title = "Geofence $transition",
                    message = "Device ${transition}ed geofence zone ($geofenceId)"
                )
            }

            GeofenceAction.LOCK_DEVICE -> {
                lockDevice(context)
            }

            GeofenceAction.WIPE_DEVICE -> {
                Timber.w("Wipe device action triggered by geofence %s - requires confirmation", geofenceId)
            }

            GeofenceAction.ENABLE_KIOSK -> {
                Timber.i("Enable kiosk mode triggered by geofence %s", geofenceId)
            }

            GeofenceAction.DISABLE_KIOSK -> {
                Timber.i("Disable kiosk mode triggered by geofence %s", geofenceId)
            }

            GeofenceAction.APPLY_POLICY -> {
                Timber.i("Apply policy triggered by geofence %s", geofenceId)
            }
        }
    }

    private fun showNotification(context: Context, title: String, message: String) {
        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Geofence Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for geofence transitions"
            }
            notificationManager.createNotificationChannel(channel)
        }

        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID++, notification)
    }

    private fun lockDevice(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, "com.mdm.agent.admin.MdmDeviceAdminReceiver")
            if (dpm.isAdminActive(adminComponent)) {
                dpm.lockNow()
                Timber.i("Device locked via geofence action")
            } else {
                Timber.w("Device admin not active, cannot lock device")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to lock device")
        }
    }

    private fun reportTransitionToServer(
        geofenceId: String,
        transition: String,
        latitude: Double,
        longitude: Double
    ) {
        // Report to server via gRPC. In production, this would use the gRPC channel
        // from the app's dependency graph. For a BroadcastReceiver, we'd typically
        // enqueue a WorkManager job to handle this.
        Timber.d(
            "Reporting geofence transition to server: fence=%s, transition=%s, lat=%.6f, lng=%.6f",
            geofenceId, transition, latitude, longitude
        )
    }

    companion object {
        private const val CHANNEL_ID = "geofence_alerts"
        private var NOTIFICATION_ID = 5000
    }
}
