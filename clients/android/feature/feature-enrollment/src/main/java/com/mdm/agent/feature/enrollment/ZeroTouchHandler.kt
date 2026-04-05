package com.mdm.agent.feature.enrollment

import android.content.Context
import com.mdm.agent.feature.enrollment.model.EnrollmentConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ZeroTouchHandler @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    suspend fun enroll(config: EnrollmentConfig) {
        Timber.d("Processing zero-touch enrollment for server: %s", config.serverUrl)
    }

    fun isZeroTouchSupported(): Boolean {
        return try {
            val pm = context.packageManager
            pm.hasSystemFeature("com.google.android.feature.ZERO_TOUCH")
        } catch (e: Exception) {
            Timber.w(e, "Failed to check zero-touch support")
            false
        }
    }
}
