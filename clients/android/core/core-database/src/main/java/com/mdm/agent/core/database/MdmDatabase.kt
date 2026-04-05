package com.mdm.agent.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.mdm.agent.core.database.dao.CommandDao
import com.mdm.agent.core.database.dao.DeviceDao
import com.mdm.agent.core.database.dao.TelemetryDao
import com.mdm.agent.core.database.entity.CommandEntity
import com.mdm.agent.core.database.entity.DeviceEntity
import com.mdm.agent.core.database.entity.TelemetryEntity

@Database(
    entities = [
        DeviceEntity::class,
        CommandEntity::class,
        TelemetryEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class MdmDatabase : RoomDatabase() {
    abstract fun deviceDao(): DeviceDao
    abstract fun commandDao(): CommandDao
    abstract fun telemetryDao(): TelemetryDao

    companion object {
        const val DATABASE_NAME = "mdm_agent.db"
    }
}
