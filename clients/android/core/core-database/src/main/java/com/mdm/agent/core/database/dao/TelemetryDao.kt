package com.mdm.agent.core.database.dao

import androidx.room.*
import com.mdm.agent.core.database.entity.TelemetryEntity

@Dao
interface TelemetryDao {
    @Insert
    suspend fun insertTelemetry(telemetry: TelemetryEntity)

    @Insert
    suspend fun insertTelemetryBatch(telemetry: List<TelemetryEntity>)

    @Query("SELECT * FROM telemetry WHERE uploaded = 0 ORDER BY timestamp ASC LIMIT :limit")
    suspend fun getUnuploadedTelemetry(limit: Int = 100): List<TelemetryEntity>

    @Query("UPDATE telemetry SET uploaded = 1 WHERE id IN (:ids)")
    suspend fun markAsUploaded(ids: List<Long>)

    @Query("DELETE FROM telemetry WHERE uploaded = 1 AND timestamp < :beforeTimestamp")
    suspend fun deleteOldUploadedTelemetry(beforeTimestamp: Long)

    @Query("SELECT COUNT(*) FROM telemetry WHERE uploaded = 0")
    suspend fun getUnuploadedCount(): Int
}
