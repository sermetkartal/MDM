package com.mdm.agent.feature.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.mdm.agent.feature.kiosk.model.KioskConfiguration
import com.mdm.agent.feature.kiosk.model.KioskMode
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber
import javax.inject.Inject

@AndroidEntryPoint
class KioskLauncher : Activity() {

    @Inject
    lateinit var kioskOrchestrator: KioskOrchestrator

    @Inject
    lateinit var lockTaskController: LockTaskController

    @Inject
    lateinit var adminEscapeHatch: AdminEscapeHatch

    @Inject
    lateinit var kioskBrandingManager: KioskBrandingManager

    @Inject
    lateinit var signageController: SignageController

    @Inject
    lateinit var webKioskController: WebKioskController

    private var rootContainer: FrameLayout? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )

        hideSystemUI()
        setupAdminEscapeHatch()

        val config = kioskOrchestrator.getCurrentConfig()
        if (config == null) {
            Timber.w("No kiosk configuration available, finishing")
            finish()
            return
        }

        rootContainer = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(kioskBrandingManager.getBackgroundColor())
        }
        setContentView(rootContainer)

        when (config.mode) {
            KioskMode.SINGLE_APP -> launchSingleApp(config.targetPackage)
            KioskMode.MULTI_APP -> showAppGrid(config)
            KioskMode.DIGITAL_SIGNAGE -> showSignage(config)
            KioskMode.WEB_KIOSK -> showWebKiosk(config)
            KioskMode.ASSESSMENT -> launchSingleApp(config.targetPackage) // Assessment is like single-app
        }

        if (!isInLockTaskMode()) {
            lockTaskController.startLockTaskFromActivity(this)
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemUI()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Block back button in kiosk mode
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // Intercept hardware keys
        return when (keyCode) {
            KeyEvent.KEYCODE_HOME,
            KeyEvent.KEYCODE_APP_SWITCH,
            KeyEvent.KEYCODE_POWER,
            KeyEvent.KEYCODE_VOLUME_DOWN,
            KeyEvent.KEYCODE_VOLUME_UP,
            KeyEvent.KEYCODE_MENU -> true // Consume
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }

    private fun launchSingleApp(targetPackage: String?) {
        if (targetPackage == null) {
            Timber.e("No target package specified for single-app kiosk mode")
            showErrorState("No target application configured")
            return
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(targetPackage)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(launchIntent)
        } else {
            Timber.e("Cannot find launch intent for package: %s", targetPackage)
            showErrorState("Application not found: $targetPackage")
        }
    }

    private fun showAppGrid(config: KioskConfiguration) {
        Timber.d("Showing app grid with %d packages", config.allowedPackages.size)
        val container = rootContainer ?: return

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Branding header
        kioskBrandingManager.getBrandingMessage()?.let { message ->
            val header = TextView(this).apply {
                text = message
                textSize = 20f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(16, 32, 16, 16)
            }
            layout.addView(header)
        }

        // App grid
        val recyclerView = RecyclerView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            layoutManager = GridLayoutManager(this@KioskLauncher, APP_GRID_COLUMNS)
            setPadding(16, 16, 16, 16)
            clipToPadding = false
        }

        val apps = loadAppInfoList(config.allowedPackages)
        recyclerView.adapter = AppGridAdapter(apps) { appInfo ->
            val intent = packageManager.getLaunchIntentForPackage(appInfo.packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            }
        }

        layout.addView(recyclerView)
        container.addView(layout)
    }

    private fun showSignage(config: KioskConfiguration) {
        val container = rootContainer ?: return
        signageController.attachContainer(container)
        signageController.startSignage(config)
    }

    private fun showWebKiosk(config: KioskConfiguration) {
        val container = rootContainer ?: return
        webKioskController.startWebKiosk(config)
        webKioskController.createWebView(container, config.webKioskShowNavBar)
    }

    private fun showErrorState(message: String) {
        val container = rootContainer ?: return
        val errorView = TextView(this).apply {
            text = message
            textSize = 18f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        container.addView(errorView)
    }

    private fun setupAdminEscapeHatch() {
        adminEscapeHatch.setOnEscapeTriggeredListener {
            adminEscapeHatch.showPinDialog(this)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            // Detect taps in the top-right corner for admin escape
            val cornerSize = resources.displayMetrics.widthPixels / 10
            if (event.x > resources.displayMetrics.widthPixels - cornerSize &&
                event.y < cornerSize
            ) {
                adminEscapeHatch.onCornerTap()
            }
        }
        return super.onTouchEvent(event)
    }

    private fun hideSystemUI() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
    }

    private fun isInLockTaskMode(): Boolean {
        val am = getSystemService(ACTIVITY_SERVICE) as ActivityManager
        return am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    private fun loadAppInfoList(packages: List<String>): List<AppInfo> {
        return packages.mapNotNull { pkg ->
            try {
                val appInfo = packageManager.getApplicationInfo(pkg, 0)
                AppInfo(
                    packageName = pkg,
                    label = packageManager.getApplicationLabel(appInfo).toString(),
                    icon = packageManager.getApplicationIcon(appInfo)
                )
            } catch (e: PackageManager.NameNotFoundException) {
                Timber.w("Package not found for grid: %s", pkg)
                null
            }
        }
    }

    data class AppInfo(
        val packageName: String,
        val label: String,
        val icon: android.graphics.drawable.Drawable,
    )

    private class AppGridAdapter(
        private val apps: List<AppInfo>,
        private val onClick: (AppInfo) -> Unit,
    ) : RecyclerView.Adapter<AppGridAdapter.ViewHolder>() {

        class ViewHolder(val layout: LinearLayout) : RecyclerView.ViewHolder(layout) {
            val icon: ImageView = layout.getChildAt(0) as ImageView
            val label: TextView = layout.getChildAt(1) as TextView
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val layout = LinearLayout(parent.context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                layoutParams = RecyclerView.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
                setPadding(8, 16, 8, 16)
            }

            val iconSize = (parent.context.resources.displayMetrics.density * 48).toInt()
            val icon = ImageView(parent.context).apply {
                layoutParams = LinearLayout.LayoutParams(iconSize, iconSize)
            }
            layout.addView(icon)

            val label = TextView(parent.context).apply {
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
                gravity = Gravity.CENTER
                setTextColor(Color.WHITE)
                textSize = 12f
                maxLines = 2
                setPadding(0, 8, 0, 0)
            }
            layout.addView(label)

            return ViewHolder(layout)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val app = apps[position]
            holder.icon.setImageDrawable(app.icon)
            holder.label.text = app.label
            holder.layout.setOnClickListener { onClick(app) }
        }

        override fun getItemCount() = apps.size
    }

    companion object {
        private const val APP_GRID_COLUMNS = 4
    }
}
