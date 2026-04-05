package com.mdm.agent.core.network.di

import com.mdm.agent.core.network.CertificatePinning
import com.mdm.agent.core.network.GrpcClient
import com.mdm.agent.core.network.MqttClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(certificatePinning: CertificatePinning): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        val trustManager = certificatePinning.getTrustManager()
        val sslContext = certificatePinning.createSslContext()
        if (trustManager != null && sslContext != null) {
            builder.sslSocketFactory(sslContext.socketFactory, trustManager)
        }

        return builder.build()
    }
}
