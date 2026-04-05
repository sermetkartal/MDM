package com.mdm.agent.feature.kiosk

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.mdm.agent.feature.kiosk.model.KioskConfiguration
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class KioskBrandingManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var currentBackgroundColor: Int = Color.BLACK
    private var logoUrl: String? = null
    private var cachedLogoBitmap: Bitmap? = null
    private var brandingMessage: String? = null

    fun applyBranding(config: KioskConfiguration) {
        config.brandingBackgroundColor?.let { colorStr ->
            try {
                currentBackgroundColor = Color.parseColor(colorStr)
                Timber.d("Applied branding background color: %s", colorStr)
            } catch (e: IllegalArgumentException) {
                Timber.w("Invalid branding color: %s", colorStr)
            }
        }

        config.brandingLogoUrl?.let { url ->
            logoUrl = url
            Timber.d("Set branding logo URL: %s", url)
        }

        config.brandingMessage?.let { message ->
            brandingMessage = message
        }
    }

    suspend fun downloadAndCacheLogo(): Bitmap? {
        val url = logoUrl ?: return null
        val cacheFile = File(context.cacheDir, "kiosk_logo.png")

        return withContext(Dispatchers.IO) {
            try {
                if (cacheFile.exists() && cacheFile.lastModified() > System.currentTimeMillis() - LOGO_CACHE_TTL_MS) {
                    val cached = BitmapFactory.decodeFile(cacheFile.absolutePath)
                    if (cached != null) {
                        cachedLogoBitmap = cached
                        return@withContext cached
                    }
                }

                val connection = URL(url).openConnection()
                connection.connectTimeout = DOWNLOAD_TIMEOUT_MS
                connection.readTimeout = DOWNLOAD_TIMEOUT_MS
                val inputStream = connection.getInputStream()

                val bitmap = BitmapFactory.decodeStream(inputStream)
                inputStream.close()

                if (bitmap != null) {
                    cacheFile.outputStream().use { out ->
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    }
                    cachedLogoBitmap = bitmap
                }
                bitmap
            } catch (e: Exception) {
                Timber.e(e, "Failed to download branding logo")
                if (cacheFile.exists()) {
                    val fallback = BitmapFactory.decodeFile(cacheFile.absolutePath)
                    cachedLogoBitmap = fallback
                    fallback
                } else {
                    null
                }
            }
        }
    }

    fun getCachedLogo(): Bitmap? = cachedLogoBitmap

    fun getBackgroundColor(): Int = currentBackgroundColor

    fun getLogoUrl(): String? = logoUrl

    fun getBrandingMessage(): String? = brandingMessage

    fun resetBranding() {
        currentBackgroundColor = Color.BLACK
        logoUrl = null
        cachedLogoBitmap = null
        brandingMessage = null
        val cacheFile = File(context.cacheDir, "kiosk_logo.png")
        cacheFile.delete()
    }

    companion object {
        private const val LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000L // 24 hours
        private const val DOWNLOAD_TIMEOUT_MS = 15_000
    }
}
