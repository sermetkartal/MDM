package com.mdm.agent.feature.kiosk

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.mdm.agent.core.common.Constants
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@AndroidEntryPoint
class KioskWatchdog : Service() {

    @Inject
    lateinit var kioskOrchestrator: KioskOrchestrator

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var monitorJob: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null

    // Crash tracking
    private val crashTimestamps = mutableListOf<Long>()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Timber.d("KioskWatchdog service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        acquireWakeLock()
        startMonitoring()
        scheduleBackupWorker()
        Timber.d("KioskWatchdog started")
        return START_STICKY
    }

    override fun onDestroy() {
        monitorJob?.cancel()
        scope.cancel()
        releaseWakeLock()
        Timber.d("KioskWatchdog stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startMonitoring() {
        monitorJob?.cancel()
        monitorJob = scope.launch {
            while (isActive) {
                try {
                    checkForegroundApp()
                    checkKioskAppAlive()
                    checkScreenState()
                    monitorBattery()
                } catch (e: Exception) {
                    Timber.e(e, "Watchdog check failed")
                }
                delay(Constants.WATCHDOG_CHECK_INTERVAL_MS)
            }
        }
    }

    private fun checkForegroundApp() {
        val config = kioskOrchestrator.getCurrentConfig() ?: return

        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val stats = usm.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            now - 10_000,
            now
        )

        val foregroundApp = stats
            ?.maxByOrNull { it.lastTimeUsed }
            ?.packageName

        if (foregroundApp != null && foregroundApp != packageName) {
            val allowedPackages = buildSet {
                add(packageName)
                addAll(config.allowedPackages)
                config.targetPackage?.let { add(it) }
                // System UI packages that may appear during transitions
                add("com.android.systemui")
            }

            if (foregroundApp !in allowedPackages) {
                Timber.w("Unauthorized app in foreground: %s, relaunching kiosk", foregroundApp)
                relaunchKiosk()
            }
        }
    }

    private fun checkKioskAppAlive() {
        val config = kioskOrchestrator.getCurrentConfig() ?: return
        val targetPackage = config.targetPackage ?: return

        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        @Suppress("DEPRECATION")
        val runningProcesses = am.runningAppProcesses ?: return

        val isAlive = runningProcesses.any { processInfo ->
            processInfo.processName == targetPackage
        }

        if (!isAlive && config.autoRestartOnCrash) {
            val now = System.currentTimeMillis()
            crashTimestamps.add(now)
            // Clean old timestamps
            crashTimestamps.removeAll { now - it > CRASH_WINDOW_MS }

            Timber.w("Kiosk app %s not running, crash count: %d", targetPackage, crashTimestamps.size)

            if (crashTimestamps.size >= MAX_CRASHES_IN_WINDOW) {
                Timber.e("Kiosk app %s crashed %d times in %ds, showing error",
                    targetPackage, crashTimestamps.size, CRASH_WINDOW_MS / 1000)
                crashTimestamps.clear()
                notifyServerOfCrashLoop(targetPackage)
                showErrorNotification(targetPackage)
            } else {
                relaunchKiosk()
            }
        }
    }

    private fun checkScreenState() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!powerManager.isInteractive) {
            Timber.d("Screen is off, waking device")
            wakeScreen()
        }
    }

    private fun monitorBattery() {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)

        if (level <= LOW_BATTERY_THRESHOLD && level > 0) {
            Timber.w("Kiosk device battery low: %d%%", level)
        }
    }

    @Suppress("DEPRECATION")
    private fun wakeScreen() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val wl = powerManager.newWakeLock(
            PowerManager.FULL_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
            "mdm:kiosk_wake"
        )
        wl.acquire(3000L)
        wl.release()
    }

    private fun relaunchKiosk() {
        val intent = Intent(this, KioskLauncher::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        startActivity(intent)
    }

    private fun notifyServerOfCrashLoop(packageName: String) {
        Timber.e("Notifying server of crash loop for: %s", packageName)
        // Server notification handled by orchestrator's event bus
    }

    private fun showErrorNotification(packageName: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kiosk App Error")
            .setContentText("$packageName has stopped responding. Contact your administrator.")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        nm.notify(ERROR_NOTIFICATION_ID, notification)
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "mdm:kiosk_watchdog"
        ).apply {
            acquire()
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Kiosk Mode",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Kiosk mode monitoring service"
            setShowBadge(false)
        }
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, KioskLauncher::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kiosk Mode Active")
            .setContentText("Device is in managed kiosk mode")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun scheduleBackupWorker() {
        val workRequest = PeriodicWorkRequestBuilder<WatchdogBackupWorker>(
            15, TimeUnit.MINUTES
        ).build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            BACKUP_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
        Timber.d("Scheduled watchdog backup worker")
    }

    class WatchdogBackupWorker(
        context: Context,
        params: WorkerParameters,
    ) : Worker(context, params) {
        override fun doWork(): Result {
            // Check if watchdog service is running; restart if not
            val am = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            @Suppress("DEPRECATION")
            val isRunning = am.getRunningServices(Int.MAX_VALUE).any {
                it.service.className == KioskWatchdog::class.java.name
            }

            if (!isRunning) {
                Timber.w("Watchdog service not running, restarting")
                val prefs = applicationContext.getSharedPreferences("mdm_kiosk", Context.MODE_PRIVATE)
                val kioskActive = prefs.getBoolean(Constants.PREF_KIOSK_ACTIVE, false)
                if (kioskActive) {
                    val intent = Intent(applicationContext, KioskWatchdog::class.java)
                    applicationContext.startForegroundService(intent)
                }
            }

            return Result.success()
        }
    }

    companion object {
        private const val NOTIFICATION_ID = 2001
        private const val ERROR_NOTIFICATION_ID = 2002
        private const val CHANNEL_ID = "mdm_kiosk"
        private const val BACKUP_WORK_NAME = "kiosk_watchdog_backup"
        private const val MAX_CRASHES_IN_WINDOW = 3
        private const val CRASH_WINDOW_MS = 60_000L
        private const val LOW_BATTERY_THRESHOLD = 15
    }
}
