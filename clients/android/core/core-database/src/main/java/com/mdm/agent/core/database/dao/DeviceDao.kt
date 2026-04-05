package com.mdm.agent.core.database.dao

import androidx.room.*
import com.mdm.agent.core.database.entity.DeviceEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DeviceDao {
    @Query("SELECT * FROM devices LIMIT 1")
    suspend fun getDevice(): DeviceEntity?

    @Query("SELECT * FROM devices LIMIT 1")
    fun observeDevice(): Flow<DeviceEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDevice(device: DeviceEntity)

    @Update
    suspend fun updateDevice(device: DeviceEntity)

    @Query("UPDATE devices SET last_check_in = :timestamp WHERE device_id = :deviceId")
    suspend fun updateLastCheckIn(deviceId: String, timestamp: Long)

    @Query("UPDATE devices SET policy_version = :version WHERE device_id = :deviceId")
    suspend fun updatePolicyVersion(deviceId: String, version: Long)

    @Query("DELETE FROM devices")
    suspend fun clearAll()
}
