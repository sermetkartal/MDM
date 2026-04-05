package com.mdm.agent.core.common

object Constants {
    const val DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000L
    const val WATCHDOG_CHECK_INTERVAL_MS = 2_000L
    const val COMMAND_POLL_INTERVAL_MS = 30_000L
    const val TELEMETRY_UPLOAD_INTERVAL_MS = 300_000L
    const val GEOFENCE_RADIUS_DEFAULT_METERS = 100f
    const val MAX_RETRY_ATTEMPTS = 5
    const val RETRY_BACKOFF_BASE_MS = 1_000L

    const val GRPC_DEFAULT_PORT = 443
    const val MQTT_DEFAULT_PORT = 8883

    const val PREF_DEVICE_ID = "device_id"
    const val PREF_ENROLLMENT_TOKEN = "enrollment_token"
    const val PREF_SERVER_URL = "server_url"
    const val PREF_KIOSK_ACTIVE = "kiosk_active"

    const val ACTION_AGENT_COMMAND = "com.mdm.agent.ACTION_COMMAND"
    const val ACTION_KIOSK_ENTER = "com.mdm.agent.ACTION_KIOSK_ENTER"
    const val ACTION_KIOSK_EXIT = "com.mdm.agent.ACTION_KIOSK_EXIT"

    const val EXTRA_COMMAND_ID = "command_id"
    const val EXTRA_COMMAND_TYPE = "command_type"
    const val EXTRA_COMMAND_PAYLOAD = "command_payload"
}
