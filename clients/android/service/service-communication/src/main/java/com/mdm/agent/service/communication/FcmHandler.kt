package com.mdm.agent.service.communication

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber
import javax.inject.Inject

@AndroidEntryPoint
class FcmHandler : FirebaseMessagingService() {

    @Inject
    lateinit var connectionManager: ConnectionManager

    override fun onNewToken(token: String) {
        Timber.d("FCM token refreshed")
        connectionManager.onFcmTokenRefreshed(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Timber.d("FCM message received from: %s", message.from)

        val data = message.data
        val messageType = data["type"] ?: "unknown"

        when (messageType) {
            "command" -> handleCommandMessage(data)
            "policy_update" -> handlePolicyUpdateMessage(data)
            "wake" -> handleWakeMessage()
            else -> Timber.w("Unknown FCM message type: %s", messageType)
        }
    }

    private fun handleCommandMessage(data: Map<String, String>) {
        val commandId = data["command_id"] ?: return
        val commandType = data["command_type"] ?: return
        Timber.d("FCM command received: id=%s, type=%s", commandId, commandType)
        connectionManager.onCommandReceived(commandId, commandType, data["payload"])
    }

    private fun handlePolicyUpdateMessage(data: Map<String, String>) {
        val policyVersion = data["policy_version"]?.toLongOrNull() ?: return
        Timber.d("FCM policy update received: version=%d", policyVersion)
        connectionManager.onPolicyUpdateAvailable(policyVersion)
    }

    private fun handleWakeMessage() {
        Timber.d("FCM wake message received")
        connectionManager.onWakeReceived()
    }
}
