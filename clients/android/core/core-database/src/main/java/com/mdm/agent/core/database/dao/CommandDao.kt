package com.mdm.agent.core.database.dao

import androidx.room.*
import com.mdm.agent.core.database.entity.CommandEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CommandDao {
    @Query("SELECT * FROM commands WHERE device_id = :deviceId ORDER BY received_at DESC")
    fun observeCommands(deviceId: String): Flow<List<CommandEntity>>

    @Query("SELECT * FROM commands WHERE status = 'PENDING' ORDER BY received_at ASC")
    suspend fun getPendingCommands(): List<CommandEntity>

    @Query("SELECT * FROM commands WHERE command_id = :commandId")
    suspend fun getCommandById(commandId: String): CommandEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCommand(command: CommandEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCommands(commands: List<CommandEntity>)

    @Query("UPDATE commands SET status = :status, executed_at = :executedAt, result_message = :resultMessage WHERE command_id = :commandId")
    suspend fun updateCommandStatus(
        commandId: String,
        status: String,
        executedAt: Long,
        resultMessage: String?,
    )

    @Query("UPDATE commands SET retry_count = retry_count + 1 WHERE command_id = :commandId")
    suspend fun incrementRetryCount(commandId: String)

    @Query("DELETE FROM commands WHERE executed_at < :beforeTimestamp AND status != 'PENDING'")
    suspend fun deleteOldCommands(beforeTimestamp: Long)
}
