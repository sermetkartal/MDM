package com.mdm.agent.core.security.di

import com.mdm.agent.core.security.AttestationManager
import com.mdm.agent.core.security.EncryptionHelper
import com.mdm.agent.core.security.KeystoreManager
import com.mdm.agent.core.security.RootDetector
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object SecurityModule {

    @Provides
    @Singleton
    fun provideKeystoreManager(): KeystoreManager = KeystoreManager()

    @Provides
    @Singleton
    fun provideRootDetector(): RootDetector = RootDetector()
}
