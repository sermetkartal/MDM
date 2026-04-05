package com.mdm.agent.feature.enrollment.model

data class EnrollmentConfig(
    val serverUrl: String,
    val tenantId: String,
    val enrollmentToken: String,
    val enrollmentMethod: EnrollmentMethod,
    val deviceOwnerMode: Boolean = true,
    val wifiSsid: String? = null,
    val wifiPassword: String? = null,
    val locale: String? = null,
    val skipEncryption: Boolean = false,
)

enum class EnrollmentMethod {
    QR_CODE,
    NFC,
    ZERO_TOUCH,
    MANUAL,
}

enum class EnrollmentState {
    NOT_ENROLLED,
    ENROLLING,
    ENROLLED,
    ENROLLMENT_FAILED,
    UNENROLLING,
}
