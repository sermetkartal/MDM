package com.mdm.agent.core.database.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "commands")
data class CommandEntity(
    @PrimaryKey
    @ColumnInfo(name = "command_id")
    val commandId: String,

    @ColumnInfo(name = "device_id")
    val deviceId: String,

    @ColumnInfo(name = "command_type")
    val commandType: String,

    @ColumnInfo(name = "payload")
    val payload: String,

    @ColumnInfo(name = "status")
    val status: String,

    @ColumnInfo(name = "received_at")
    val receivedAt: Long,

    @ColumnInfo(name = "executed_at")
    val executedAt: Long? = null,

    @ColumnInfo(name = "result_message")
    val resultMessage: String? = null,

    @ColumnInfo(name = "retry_count")
    val retryCount: Int = 0,
)
