package com.mdm.agent

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class MdmApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override fun onCreate() {
        super.onCreate()
        initTimber()
        createNotificationChannels()
    }

    private fun initTimber() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)

        val agentChannel = NotificationChannel(
            CHANNEL_AGENT_SERVICE,
            "MDM Agent Service",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Persistent notification for the MDM agent service"
            setShowBadge(false)
        }

        val commandChannel = NotificationChannel(
            CHANNEL_COMMANDS,
            "MDM Commands",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for device management commands"
        }

        val kioskChannel = NotificationChannel(
            CHANNEL_KIOSK,
            "Kiosk Mode",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Kiosk watchdog service notification"
            setShowBadge(false)
        }

        manager.createNotificationChannels(listOf(agentChannel, commandChannel, kioskChannel))
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    companion object {
        const val CHANNEL_AGENT_SERVICE = "mdm_agent_service"
        const val CHANNEL_COMMANDS = "mdm_commands"
        const val CHANNEL_KIOSK = "mdm_kiosk"
    }
}
