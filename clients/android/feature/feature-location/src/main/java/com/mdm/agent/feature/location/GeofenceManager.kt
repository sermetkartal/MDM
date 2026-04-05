package com.mdm.agent.feature.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.mdm.agent.feature.location.model.GeofenceAction
import com.mdm.agent.feature.location.model.GeofenceConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GeofenceManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val locationController: LocationController,
) {
    private val geofencingClient: GeofencingClient = LocationServices.getGeofencingClient(context)
    private val activeGeofences = mutableMapOf<String, GeofenceConfig>()

    private val geofencePendingIntent: PendingIntent by lazy {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        PendingIntent.getBroadcast(
            context,
            GEOFENCE_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }

    /**
     * Register a list of geofences with Google Play Services GeofencingClient.
     * Creates Geofence objects with ENTER/EXIT/DWELL transitions based on config.
     */
    @SuppressLint("MissingPermission")
    fun registerGeofences(fences: List<GeofenceConfig>) {
        if (!hasLocationPermission()) {
            Timber.w("Location permission not granted, cannot register geofences")
            return
        }

        if (fences.isEmpty()) {
            Timber.d("No geofences to register")
            return
        }

        val geofenceList = fences.map { config ->
            activeGeofences[config.id] = config

            val builder = Geofence.Builder()
                .setRequestId(config.id)
                .setCircularRegion(config.latitude, config.longitude, config.radiusMeters)
                .setExpirationDuration(
                    if (config.expirationDurationMs == GeofenceConfig.NEVER_EXPIRE) {
                        Geofence.NEVER_EXPIRE
                    } else {
                        config.expirationDurationMs
                    }
                )
                .setTransitionTypes(config.transitionTypes)

            if (config.transitionTypes and GeofenceConfig.TRANSITION_DWELL != 0) {
                builder.setLoiteringDelay(config.loiteringDelayMs)
            }

            if (config.notificationResponsiveness > 0) {
                builder.setNotificationResponsiveness(config.notificationResponsiveness)
            }

            builder.build()
        }

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER or GeofencingRequest.INITIAL_TRIGGER_DWELL)
            .addGeofences(geofenceList)
            .build()

        geofencingClient.addGeofences(request, geofencePendingIntent)
            .addOnSuccessListener {
                Timber.d("Successfully registered %d geofences", fences.size)
            }
            .addOnFailureListener { e ->
                when {
                    isGeofenceNotAvailable(e) -> {
                        Timber.w("Geofence not available - location services may be off")
                        handleGeofenceNotAvailable()
                    }
                    else -> Timber.e(e, "Failed to register geofences")
                }
            }
    }

    /**
     * Remove a specific geofence by ID.
     */
    fun removeGeofence(id: String) {
        activeGeofences.remove(id)
        geofencingClient.removeGeofences(listOf(id))
            .addOnSuccessListener { Timber.d("Removed geofence: %s", id) }
            .addOnFailureListener { e -> Timber.e(e, "Failed to remove geofence: %s", id) }
    }

    /**
     * Remove all registered geofences.
     */
    fun removeAllGeofences() {
        activeGeofences.clear()
        geofencingClient.removeGeofences(geofencePendingIntent)
            .addOnSuccessListener { Timber.d("Removed all geofences") }
            .addOnFailureListener { e -> Timber.e(e, "Failed to remove all geofences") }
    }

    fun getActiveGeofences(): List<GeofenceConfig> = activeGeofences.values.toList()

    /**
     * Re-register all known geofences. Called after BOOT_COMPLETED.
     */
    fun reRegisterGeofences() {
        val fences = activeGeofences.values.toList()
        if (fences.isNotEmpty()) {
            Timber.d("Re-registering %d geofences after boot", fences.size)
            registerGeofences(fences)
        }
    }

    /**
     * Check current location against active geofences manually.
     */
    fun checkGeofences() {
        val location = locationController.getLastKnownLocation() ?: return

        for (geofence in activeGeofences.values) {
            val results = FloatArray(1)
            android.location.Location.distanceBetween(
                location.latitude, location.longitude,
                geofence.latitude, geofence.longitude,
                results
            )

            val distance = results[0]
            val isInside = distance <= geofence.radiusMeters

            Timber.d("Geofence %s: distance=%.1fm, inside=%b", geofence.id, distance, isInside)
        }
    }

    private fun hasLocationPermission(): Boolean {
        val fineLocation = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val backgroundLocation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        return fineLocation && backgroundLocation
    }

    private fun isGeofenceNotAvailable(e: Exception): Boolean {
        return e.message?.contains("GEOFENCE_NOT_AVAILABLE") == true ||
                e.message?.contains("1000") == true
    }

    private fun handleGeofenceNotAvailable() {
        Timber.w("Location services appear to be disabled. Geofences will not work until enabled.")
    }

    companion object {
        private const val GEOFENCE_REQUEST_CODE = 9876
    }
}
