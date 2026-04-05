package com.mdm.agent.feature.kiosk

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.VideoView
import com.mdm.agent.feature.kiosk.model.KioskConfiguration
import com.mdm.agent.feature.kiosk.model.SignageItem
import com.mdm.agent.feature.kiosk.model.SignageItemType
import com.mdm.agent.feature.kiosk.model.TransitionEffect
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SignageController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var isRunning = false
    private var currentConfig: KioskConfiguration? = null
    private var playlist: List<SignageItem> = emptyList()
    private var currentIndex = 0
    private var scope: CoroutineScope? = null
    private var rotationJob: Job? = null

    private var containerView: FrameLayout? = null
    private var imageView: ImageView? = null
    private var videoView: VideoView? = null
    private var webView: WebView? = null

    fun startSignage(config: KioskConfiguration) {
        currentConfig = config
        playlist = config.signagePlaylist.ifEmpty {
            // Fallback: if no playlist but a signage URL exists, create a single web item
            config.signageUrl?.let { url ->
                listOf(
                    SignageItem(
                        type = SignageItemType.WEB,
                        url = url,
                        durationMs = if (config.signageRefreshIntervalMs > 0) config.signageRefreshIntervalMs else 30_000L,
                    )
                )
            } ?: emptyList()
        }

        if (playlist.isEmpty()) {
            Timber.w("No signage content configured")
            return
        }

        isRunning = true
        currentIndex = 0
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

        // Pre-cache content
        scope?.launch {
            cacheAllContent()
            startRotation()
        }

        Timber.d("Starting digital signage with %d items", playlist.size)
    }

    fun stopSignage() {
        isRunning = false
        rotationJob?.cancel()
        scope?.cancel()
        scope = null
        releaseMediaResources()
        currentConfig = null
        playlist = emptyList()
        Timber.d("Stopped digital signage")
    }

    fun attachContainer(container: FrameLayout) {
        this.containerView = container
    }

    fun isActive(): Boolean = isRunning

    private fun startRotation() {
        rotationJob = scope?.launch {
            while (isActive && isRunning && playlist.isNotEmpty()) {
                val item = playlist[currentIndex]
                showItem(item)
                delay(item.durationMs)
                currentIndex = (currentIndex + 1) % playlist.size
            }
        }
    }

    private suspend fun showItem(item: SignageItem) {
        val container = containerView ?: return

        when (item.type) {
            SignageItemType.IMAGE -> showImage(container, item)
            SignageItemType.VIDEO -> showVideo(container, item)
            SignageItemType.WEB -> showWeb(container, item)
            SignageItemType.HTML -> showHtml(container, item)
        }
    }

    private suspend fun showImage(container: FrameLayout, item: SignageItem) {
        releaseMediaResources()
        val cachedFile = getCacheFile(item.url)
        val bitmap: Bitmap? = if (cachedFile.exists()) {
            withContext(Dispatchers.IO) {
                BitmapFactory.decodeFile(cachedFile.absolutePath)
            }
        } else {
            withContext(Dispatchers.IO) {
                try {
                    val conn = URL(item.url).openConnection()
                    conn.connectTimeout = DOWNLOAD_TIMEOUT_MS
                    conn.readTimeout = DOWNLOAD_TIMEOUT_MS
                    BitmapFactory.decodeStream(conn.getInputStream())
                } catch (e: Exception) {
                    Timber.e(e, "Failed to load signage image: %s", item.url)
                    null
                }
            }
        }

        if (bitmap != null) {
            val iv = ImageView(context).apply {
                scaleType = ImageView.ScaleType.FIT_CENTER
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                setImageBitmap(bitmap)
            }

            applyTransition(container, iv, item.transitionEffect)
            imageView = iv
        }
    }

    private fun showVideo(container: FrameLayout, item: SignageItem) {
        releaseMediaResources()
        val cachedFile = getCacheFile(item.url)
        val uri = if (cachedFile.exists()) {
            Uri.fromFile(cachedFile)
        } else {
            Uri.parse(item.url)
        }

        val vv = VideoView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setVideoURI(uri)
            setOnCompletionListener { start() } // Loop
            if (!item.audioEnabled) {
                setOnPreparedListener { mp ->
                    mp.setVolume(0f, 0f)
                }
            }
            start()
        }

        applyTransition(container, vv, item.transitionEffect)
        videoView = vv
    }

    private fun showWeb(container: FrameLayout, item: SignageItem) {
        releaseMediaResources()
        val wv = createSignageWebView()
        wv.loadUrl(item.url)
        applyTransition(container, wv, item.transitionEffect)
        webView = wv
    }

    private fun showHtml(container: FrameLayout, item: SignageItem) {
        releaseMediaResources()
        val cachedFile = getCacheFile(item.url)
        val wv = createSignageWebView()

        if (cachedFile.exists()) {
            val html = cachedFile.readText()
            wv.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        } else {
            wv.loadUrl(item.url)
        }

        applyTransition(container, wv, item.transitionEffect)
        webView = wv
    }

    private fun createSignageWebView(): WebView {
        return WebView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            webViewClient = WebViewClient()
        }
    }

    private fun applyTransition(container: FrameLayout, newView: View, effect: TransitionEffect) {
        when (effect) {
            TransitionEffect.CROSSFADE -> {
                newView.alpha = 0f
                container.addView(newView)
                newView.animate().alpha(1f).setDuration(TRANSITION_DURATION_MS).start()
                // Remove old views after transition
                if (container.childCount > 1) {
                    val oldView = container.getChildAt(0)
                    oldView.animate().alpha(0f).setDuration(TRANSITION_DURATION_MS).withEndAction {
                        container.removeView(oldView)
                    }.start()
                }
            }
            TransitionEffect.SLIDE_LEFT -> {
                newView.translationX = container.width.toFloat()
                container.addView(newView)
                newView.animate().translationX(0f).setDuration(TRANSITION_DURATION_MS).start()
                if (container.childCount > 1) {
                    val oldView = container.getChildAt(0)
                    oldView.animate().translationX(-container.width.toFloat())
                        .setDuration(TRANSITION_DURATION_MS)
                        .withEndAction { container.removeView(oldView) }
                        .start()
                }
            }
            TransitionEffect.SLIDE_RIGHT -> {
                newView.translationX = -container.width.toFloat()
                container.addView(newView)
                newView.animate().translationX(0f).setDuration(TRANSITION_DURATION_MS).start()
                if (container.childCount > 1) {
                    val oldView = container.getChildAt(0)
                    oldView.animate().translationX(container.width.toFloat())
                        .setDuration(TRANSITION_DURATION_MS)
                        .withEndAction { container.removeView(oldView) }
                        .start()
                }
            }
            TransitionEffect.NONE -> {
                container.removeAllViews()
                container.addView(newView)
            }
        }
    }

    private fun releaseMediaResources() {
        videoView?.stopPlayback()
        videoView = null
        webView?.destroy()
        webView = null
        imageView?.setImageBitmap(null)
        imageView = null
    }

    private suspend fun cacheAllContent() {
        withContext(Dispatchers.IO) {
            for (item in playlist) {
                val cacheFile = getCacheFile(item.url)
                if (cacheFile.exists()) continue

                try {
                    val conn = URL(item.url).openConnection()
                    conn.connectTimeout = DOWNLOAD_TIMEOUT_MS
                    conn.readTimeout = DOWNLOAD_TIMEOUT_MS
                    conn.getInputStream().use { input ->
                        cacheFile.outputStream().use { output ->
                            input.copyTo(output)
                        }
                    }
                    Timber.d("Cached signage content: %s", item.url)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to cache signage content: %s", item.url)
                }
            }
        }
    }

    private fun getCacheFile(url: String): File {
        val cacheDir = File(context.cacheDir, "signage")
        cacheDir.mkdirs()
        val filename = url.hashCode().toString(16) + "_" + url.substringAfterLast("/").take(50)
        return File(cacheDir, filename)
    }

    companion object {
        private const val DOWNLOAD_TIMEOUT_MS = 30_000
        private const val TRANSITION_DURATION_MS = 500L
    }
}
