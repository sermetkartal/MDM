package com.mdm.agent.feature.appmanagement

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import timber.log.Timber
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class SilentInstaller @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
    private val connectionManager: ConnectionManager,
) {
    private val pendingInstalls = ConcurrentHashMap<Int, CompletableDeferred<Result<Unit>>>()
    private val pendingUninstalls = ConcurrentHashMap<String, CompletableDeferred<Result<Unit>>>()

    suspend fun installApk(downloadUrl: String, packageName: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            Timber.d("Starting silent install for %s from %s", packageName, downloadUrl)

            // 1. Download APK from presigned URL to temp file
            val apkFile = downloadApk(downloadUrl)

            // 2. Create PackageInstaller session
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setSize(apkFile.length())

            val sessionId = installer.createSession(params)
            val session = installer.openSession(sessionId)

            // 3. Write APK to session
            session.openWrite("app", 0, apkFile.length()).use { out ->
                apkFile.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }

            // 4. Set up deferred for result
            val deferred = CompletableDeferred<Result<Unit>>()
            pendingInstalls[sessionId] = deferred

            // 5. Commit (auto-approved in Device Owner mode)
            val intent = Intent(context, InstallResultReceiver::class.java).apply {
                putExtra(EXTRA_SESSION_ID, sessionId)
                putExtra(EXTRA_PACKAGE_NAME, packageName)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, sessionId, intent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            session.commit(pendingIntent.intentSender)
            session.close()

            Timber.d("APK install session committed: %d for %s", sessionId, packageName)

            // 6. Wait for result via BroadcastReceiver with timeout
            val result = withTimeoutOrNull(INSTALL_TIMEOUT_MS) {
                deferred.await()
            } ?: run {
                pendingInstalls.remove(sessionId)
                Result.failure(Exception("Install timed out for $packageName"))
            }

            // Cleanup
            apkFile.delete()

            // Report result back to server
            reportInstallResult(packageName, result.isSuccess, if (result.isFailure) result.exceptionOrNull()?.message else null)

            result
        } catch (e: Exception) {
            Timber.e(e, "Failed to install APK for: %s", packageName)
            reportInstallResult(packageName, false, e.message)
            Result.failure(e)
        }
    }

    suspend fun uninstallApp(packageName: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            Timber.d("Starting silent uninstall for %s", packageName)

            val deferred = CompletableDeferred<Result<Unit>>()
            pendingUninstalls[packageName] = deferred

            val intent = Intent(context, InstallResultReceiver::class.java).apply {
                putExtra(EXTRA_PACKAGE_NAME, packageName)
                putExtra(EXTRA_IS_UNINSTALL, true)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, packageName.hashCode(), intent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            context.packageManager.packageInstaller.uninstall(packageName, pendingIntent.intentSender)

            val result = withTimeoutOrNull(UNINSTALL_TIMEOUT_MS) {
                deferred.await()
            } ?: run {
                pendingUninstalls.remove(packageName)
                Result.failure(Exception("Uninstall timed out for $packageName"))
            }

            reportInstallResult(packageName, result.isSuccess, if (result.isFailure) result.exceptionOrNull()?.message else null)

            result
        } catch (e: Exception) {
            Timber.e(e, "Failed to uninstall: %s", packageName)
            reportInstallResult(packageName, false, e.message)
            Result.failure(e)
        }
    }

    private suspend fun downloadApk(url: String): File = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).build()
        val response = okHttpClient.newCall(request).execute()

        if (!response.isSuccessful) {
            throw Exception("APK download failed with code: ${response.code}")
        }

        val tempFile = File(context.cacheDir, "install_${System.currentTimeMillis()}.apk")
        FileOutputStream(tempFile).use { output ->
            val body = response.body ?: throw Exception("Empty response body")
            val totalBytes = body.contentLength()
            var downloadedBytes = 0L

            body.byteStream().use { input ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    downloadedBytes += bytesRead
                    if (totalBytes > 0) {
                        val progress = (downloadedBytes * 100 / totalBytes).toInt()
                        Timber.v("Download progress: %d%%", progress)
                    }
                }
            }
        }

        Timber.d("APK downloaded to: %s (%d bytes)", tempFile.path, tempFile.length())
        tempFile
    }

    private suspend fun reportInstallResult(packageName: String, success: Boolean, errorMessage: String?) {
        try {
            connectionManager.sendCommandAck(
                commandType = if (success) "INSTALL_APP_SUCCESS" else "INSTALL_APP_FAILED",
                payload = mapOf(
                    "package_name" to packageName,
                    "success" to success,
                    "error" to (errorMessage ?: ""),
                )
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to report install result for %s", packageName)
        }
    }

    internal fun handleInstallResult(sessionId: Int, packageName: String?, status: Int, message: String?) {
        when (status) {
            PackageInstaller.STATUS_SUCCESS -> {
                Timber.d("Install succeeded for session %d (%s)", sessionId, packageName)
                pendingInstalls.remove(sessionId)?.complete(Result.success(Unit))
                packageName?.let { pendingUninstalls.remove(it)?.complete(Result.success(Unit)) }
            }
            else -> {
                val error = "Install failed: status=$status, message=$message"
                Timber.e("Install failed for session %d (%s): %s", sessionId, packageName, error)
                pendingInstalls.remove(sessionId)?.complete(Result.failure(Exception(error)))
                packageName?.let { pendingUninstalls.remove(it)?.complete(Result.failure(Exception(error))) }
            }
        }
    }

    companion object {
        const val EXTRA_SESSION_ID = "extra_session_id"
        const val EXTRA_PACKAGE_NAME = "extra_package_name"
        const val EXTRA_IS_UNINSTALL = "extra_is_uninstall"
        private const val INSTALL_TIMEOUT_MS = 5 * 60 * 1000L // 5 minutes
        private const val UNINSTALL_TIMEOUT_MS = 2 * 60 * 1000L // 2 minutes
    }
}

/**
 * BroadcastReceiver that handles install/uninstall results from PackageInstaller.
 * Registered in AndroidManifest.xml.
 */
class InstallResultReceiver : BroadcastReceiver() {
    @Inject
    lateinit var silentInstaller: SilentInstaller

    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        val sessionId = intent.getIntExtra(SilentInstaller.EXTRA_SESSION_ID, -1)
        val packageName = intent.getStringExtra(SilentInstaller.EXTRA_PACKAGE_NAME)

        Timber.d(
            "InstallResultReceiver: status=%d, message=%s, session=%d, package=%s",
            status, message, sessionId, packageName
        )

        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // In Device Owner mode this should not happen, but handle gracefully
                val confirmIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(confirmIntent)
                }
            }
            else -> {
                silentInstaller.handleInstallResult(sessionId, packageName, status, message)
            }
        }
    }
}
