package com.mdm.agent.core.database.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "devices")
data class DeviceEntity(
    @PrimaryKey
    @ColumnInfo(name = "device_id")
    val deviceId: String,

    @ColumnInfo(name = "tenant_id")
    val tenantId: String,

    @ColumnInfo(name = "serial_number")
    val serialNumber: String,

    @ColumnInfo(name = "model")
    val model: String,

    @ColumnInfo(name = "manufacturer")
    val manufacturer: String,

    @ColumnInfo(name = "os_version")
    val osVersion: String,

    @ColumnInfo(name = "sdk_version")
    val sdkVersion: Int,

    @ColumnInfo(name = "enrollment_status")
    val enrollmentStatus: String,

    @ColumnInfo(name = "server_url")
    val serverUrl: String,

    @ColumnInfo(name = "enrolled_at")
    val enrolledAt: Long,

    @ColumnInfo(name = "last_check_in")
    val lastCheckIn: Long,

    @ColumnInfo(name = "policy_version")
    val policyVersion: Long = 0,
)
