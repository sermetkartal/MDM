package com.mdm.agent.service.agent

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@AndroidEntryPoint
class AgentService : LifecycleService() {

    @Inject
    lateinit var heartbeatManager: HeartbeatManager

    @Inject
    lateinit var commandDispatcher: CommandDispatcher

    override fun onCreate() {
        super.onCreate()
        Timber.d("AgentService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        startForeground(NOTIFICATION_ID, createNotification())

        lifecycleScope.launch {
            heartbeatManager.startHeartbeat()
        }

        lifecycleScope.launch {
            commandDispatcher.startListening()
        }

        Timber.d("AgentService started")
        return START_STICKY
    }

    override fun onDestroy() {
        heartbeatManager.stopHeartbeat()
        commandDispatcher.stopListening()
        Timber.d("AgentService destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MDM Agent Active")
            .setContentText("Device is managed by your organization")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "mdm_agent_service"
    }
}
