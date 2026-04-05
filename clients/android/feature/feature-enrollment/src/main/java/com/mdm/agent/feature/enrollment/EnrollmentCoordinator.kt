package com.mdm.agent.feature.enrollment

import android.content.Context
import android.os.Build
import com.mdm.agent.core.database.dao.DeviceDao
import com.mdm.agent.core.database.entity.DeviceEntity
import com.mdm.agent.core.security.KeystoreManager
import com.mdm.agent.feature.enrollment.model.EnrollmentConfig
import com.mdm.agent.feature.enrollment.model.EnrollmentMethod
import com.mdm.agent.feature.enrollment.model.EnrollmentState
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EnrollmentCoordinator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val deviceDao: DeviceDao,
    private val keystoreManager: KeystoreManager,
    private val qrEnrollmentHandler: QrEnrollmentHandler,
    private val nfcEnrollmentHandler: NfcEnrollmentHandler,
    private val zeroTouchHandler: ZeroTouchHandler,
) {
    private val _enrollmentState = MutableStateFlow(EnrollmentState.NOT_ENROLLED)
    val enrollmentState: StateFlow<EnrollmentState> = _enrollmentState.asStateFlow()

    suspend fun startEnrollment(config: EnrollmentConfig) {
        Timber.d("Starting enrollment with method: %s", config.enrollmentMethod)
        _enrollmentState.value = EnrollmentState.ENROLLING

        try {
            keystoreManager.generateDeviceKeyPair()
            keystoreManager.generateEncryptionKey()

            when (config.enrollmentMethod) {
                EnrollmentMethod.QR_CODE -> qrEnrollmentHandler.enroll(config)
                EnrollmentMethod.NFC -> nfcEnrollmentHandler.enroll(config)
                EnrollmentMethod.ZERO_TOUCH -> zeroTouchHandler.enroll(config)
                EnrollmentMethod.MANUAL -> performManualEnrollment(config)
            }

            val deviceEntity = DeviceEntity(
                deviceId = UUID.randomUUID().toString(),
                tenantId = config.tenantId,
                serialNumber = Build.getSerial() ?: "unknown",
                model = Build.MODEL,
                manufacturer = Build.MANUFACTURER,
                osVersion = Build.VERSION.RELEASE,
                sdkVersion = Build.VERSION.SDK_INT,
                enrollmentStatus = "ENROLLED",
                serverUrl = config.serverUrl,
                enrolledAt = System.currentTimeMillis(),
                lastCheckIn = System.currentTimeMillis(),
            )
            deviceDao.insertDevice(deviceEntity)

            _enrollmentState.value = EnrollmentState.ENROLLED
            Timber.d("Enrollment completed successfully")
        } catch (e: Exception) {
            Timber.e(e, "Enrollment failed")
            _enrollmentState.value = EnrollmentState.ENROLLMENT_FAILED
            throw e
        }
    }

    suspend fun unenroll() {
        Timber.d("Starting unenrollment")
        _enrollmentState.value = EnrollmentState.UNENROLLING

        try {
            deviceDao.clearAll()
            keystoreManager.deleteKey(KeystoreManager.DEVICE_KEY_ALIAS)
            keystoreManager.deleteKey(KeystoreManager.ENCRYPTION_KEY_ALIAS)
            _enrollmentState.value = EnrollmentState.NOT_ENROLLED
            Timber.d("Unenrollment completed")
        } catch (e: Exception) {
            Timber.e(e, "Unenrollment failed")
            throw e
        }
    }

    suspend fun isEnrolled(): Boolean {
        return deviceDao.getDevice() != null
    }

    private suspend fun performManualEnrollment(config: EnrollmentConfig) {
        Timber.d("Performing manual enrollment for tenant: %s", config.tenantId)
    }
}
