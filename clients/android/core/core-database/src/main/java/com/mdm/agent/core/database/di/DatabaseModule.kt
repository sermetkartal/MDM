package com.mdm.agent.core.database.di

import android.content.Context
import androidx.room.Room
import com.mdm.agent.core.database.MdmDatabase
import com.mdm.agent.core.database.dao.CommandDao
import com.mdm.agent.core.database.dao.DeviceDao
import com.mdm.agent.core.database.dao.TelemetryDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): MdmDatabase {
        return Room.databaseBuilder(
            context,
            MdmDatabase::class.java,
            MdmDatabase.DATABASE_NAME,
        )
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideDeviceDao(database: MdmDatabase): DeviceDao = database.deviceDao()

    @Provides
    fun provideCommandDao(database: MdmDatabase): CommandDao = database.commandDao()

    @Provides
    fun provideTelemetryDao(database: MdmDatabase): TelemetryDao = database.telemetryDao()
}
