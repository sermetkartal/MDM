package com.mdm.agent.feature.kiosk

import android.content.Context
import android.graphics.Bitmap
import android.net.http.SslError
import android.view.ViewGroup
import android.webkit.DownloadListener
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import com.mdm.agent.feature.kiosk.model.KioskConfiguration
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.regex.Pattern
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebKioskController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var isRunning = false
    private var currentUrl: String? = null
    private var homeUrl: String? = null
    private var urlWhitelist: List<Pattern> = emptyList()
    private var webView: WebView? = null
    private var scope: CoroutineScope? = null
    private var refreshJob: Job? = null

    fun startWebKiosk(config: KioskConfiguration) {
        currentUrl = config.webKioskUrl
        homeUrl = config.webKioskUrl
        urlWhitelist = config.webKioskUrlWhitelist.map { compileWildcardPattern(it) }
        isRunning = true

        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

        if (config.webKioskAutoRefreshIntervalMs > 0) {
            startAutoRefresh(config.webKioskAutoRefreshIntervalMs)
        }

        Timber.d("Starting web kiosk: url=%s, whitelist=%d patterns", currentUrl, urlWhitelist.size)
    }

    fun stopWebKiosk() {
        isRunning = false
        refreshJob?.cancel()
        scope?.cancel()
        scope = null
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        webView = null
        currentUrl = null
        homeUrl = null
        urlWhitelist = emptyList()
        Timber.d("Stopped web kiosk")
    }

    fun createWebView(container: FrameLayout, showNavBar: Boolean): WebView {
        val wv = WebView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        configureWebView(wv)
        container.addView(wv)
        webView = wv

        currentUrl?.let { wv.loadUrl(it) }

        return wv
    }

    fun navigateTo(url: String) {
        if (!isRunning) return

        if (isUrlAllowed(url)) {
            currentUrl = url
            webView?.loadUrl(url)
            Timber.d("Web kiosk navigating to: %s", url)
        } else {
            Timber.w("Blocked navigation to non-whitelisted URL: %s", url)
        }
    }

    fun goBack() {
        webView?.let { wv ->
            if (wv.canGoBack()) {
                wv.goBack()
            }
        }
    }

    fun goForward() {
        webView?.let { wv ->
            if (wv.canGoForward()) {
                wv.goForward()
            }
        }
    }

    fun refresh() {
        webView?.reload()
    }

    fun goHome() {
        homeUrl?.let { navigateTo(it) }
    }

    fun getCurrentUrl(): String? = currentUrl

    fun isActive(): Boolean = isRunning

    private fun configureWebView(wv: WebView) {
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (isUrlAllowed(url)) {
                    currentUrl = url
                    return false // Allow WebView to load
                }
                Timber.w("Blocked navigation to: %s", url)
                showBlockedPage(view, url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                Timber.d("Web kiosk loading: %s", url)
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                // Reject invalid SSL certificates
                handler.cancel()
                Timber.e("SSL error on web kiosk: %s", error)
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
                result.cancel()
                return true // Suppress
            }

            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                result.cancel()
                return true
            }

            override fun onJsPrompt(
                view: WebView,
                url: String,
                message: String,
                defaultValue: String?,
                result: JsPromptResult
            ): Boolean {
                result.cancel()
                return true
            }
        }

        // Block downloads
        wv.setDownloadListener(DownloadListener { url, _, _, _, _ ->
            Timber.w("Download blocked in web kiosk: %s", url)
        })
    }

    private fun showBlockedPage(webView: WebView, blockedUrl: String) {
        val html = """
            <!DOCTYPE html>
            <html>
            <head><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: sans-serif; display: flex; justify-content: center;
                       align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
                .container { text-align: center; padding: 40px; }
                h1 { color: #d32f2f; font-size: 24px; }
                p { color: #666; font-size: 16px; }
                .url { color: #999; font-size: 12px; word-break: break-all; margin-top: 20px; }
            </style>
            </head>
            <body>
                <div class="container">
                    <h1>Access Restricted</h1>
                    <p>This page is not available in kiosk mode.</p>
                    <p>Contact your administrator for access.</p>
                    <p class="url">${blockedUrl.replace("&", "&amp;").replace("<", "&lt;")}</p>
                </div>
            </body>
            </html>
        """.trimIndent()
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
    }

    fun isUrlAllowed(url: String): Boolean {
        // If no whitelist configured, allow all
        if (urlWhitelist.isEmpty()) return true
        return urlWhitelist.any { pattern -> pattern.matcher(url).matches() }
    }

    private fun compileWildcardPattern(wildcard: String): Pattern {
        // Convert wildcard pattern like "*.company.com/*" to regex
        val regex = buildString {
            append("^https?://")
            val domainAndPath = wildcard.removePrefix("http://").removePrefix("https://")
            for (char in domainAndPath) {
                when (char) {
                    '*' -> append(".*")
                    '.' -> append("\\.")
                    '?' -> append(".")
                    else -> append(Pattern.quote(char.toString()))
                }
            }
            append("$")
        }
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE)
    }

    private fun startAutoRefresh(intervalMs: Long) {
        refreshJob = scope?.launch {
            while (isActive && isRunning) {
                delay(intervalMs)
                webView?.reload()
                Timber.d("Auto-refreshed web kiosk")
            }
        }
    }
}
