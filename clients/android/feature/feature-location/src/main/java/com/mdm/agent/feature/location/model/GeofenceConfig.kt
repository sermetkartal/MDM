package com.mdm.agent.feature.location.model

data class GeofenceConfig(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Float,
    val transitionTypes: Int = TRANSITION_ENTER or TRANSITION_EXIT,
    val expirationDurationMs: Long = NEVER_EXPIRE,
    val loiteringDelayMs: Int = 0,
    val notificationResponsiveness: Int = 0,
    val action: GeofenceAction = GeofenceAction.NOTIFY,
) {
    companion object {
        const val TRANSITION_ENTER = 1
        const val TRANSITION_EXIT = 2
        const val TRANSITION_DWELL = 4
        const val NEVER_EXPIRE = -1L
    }
}

enum class GeofenceAction {
    NOTIFY,
    LOCK_DEVICE,
    WIPE_DEVICE,
    ENABLE_KIOSK,
    DISABLE_KIOSK,
    APPLY_POLICY,
}
