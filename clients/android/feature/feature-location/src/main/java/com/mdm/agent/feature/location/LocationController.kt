package com.mdm.agent.feature.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import com.mdm.agent.feature.location.model.GeofenceConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class LocationController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val locationManager: LocationManager,
    private val geofenceManager: GeofenceManager,
) {
    @SuppressLint("MissingPermission")
    fun getLastKnownLocation(): Location? {
        return locationManager.getLastKnownLocation(LocationManager.FUSED_PROVIDER)
            ?: locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
    }

    @SuppressLint("MissingPermission")
    suspend fun getCurrentLocation(): Location? = suspendCancellableCoroutine { continuation ->
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                locationManager.removeUpdates(this)
                continuation.resume(location)
            }

            override fun onProviderDisabled(provider: String) {}
            override fun onProviderEnabled(provider: String) {}
            @Deprecated("Deprecated in API level 29")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }

        try {
            locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, null)
        } catch (e: SecurityException) {
            Timber.e(e, "Location permission not granted")
            continuation.resume(null)
        }

        continuation.invokeOnCancellation {
            locationManager.removeUpdates(listener)
        }
    }

    @SuppressLint("MissingPermission")
    fun observeLocation(minTimeMs: Long = 10_000, minDistanceM: Float = 10f): Flow<Location> = callbackFlow {
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                trySend(location)
            }

            override fun onProviderDisabled(provider: String) {}
            override fun onProviderEnabled(provider: String) {}
            @Deprecated("Deprecated in API level 29")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }

        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                minTimeMs,
                minDistanceM,
                listener
            )
        } catch (e: SecurityException) {
            Timber.e(e, "Location permission not granted")
            close(e)
        }

        awaitClose {
            locationManager.removeUpdates(listener)
        }
    }

    fun isLocationEnabled(): Boolean {
        return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    /**
     * Apply geofence configuration received from server.
     * Clears existing geofences and registers the new set.
     */
    fun applyGeofenceConfig(configs: List<GeofenceConfig>) {
        Timber.d("Applying %d geofence configs from server", configs.size)
        geofenceManager.removeAllGeofences()
        if (configs.isNotEmpty()) {
            geofenceManager.registerGeofences(configs)
        }
    }

    /**
     * Get the list of currently active geofences.
     */
    fun getActiveGeofences(): List<GeofenceConfig> {
        return geofenceManager.getActiveGeofences()
    }
}
