package com.mdm.agent.core.network

import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.grpc.okhttp.OkHttpChannelBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asExecutor
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import javax.net.ssl.SSLContext

@Singleton
class GrpcClient @Inject constructor(
    private val certificatePinning: CertificatePinning,
) {
    private var channel: ManagedChannel? = null

    fun connect(host: String, port: Int, useTls: Boolean = true): ManagedChannel {
        shutdown()

        val builder = OkHttpChannelBuilder.forAddress(host, port)
            .executor(Dispatchers.IO.asExecutor())
            .keepAliveTime(30, TimeUnit.SECONDS)
            .keepAliveTimeout(10, TimeUnit.SECONDS)
            .keepAliveWithoutCalls(true)
            .idleTimeout(5, TimeUnit.MINUTES)
            .maxRetryAttempts(5)

        if (useTls) {
            val sslContext = certificatePinning.createSslContext()
            builder.useTransportSecurity()
            if (sslContext != null) {
                builder.sslSocketFactory(sslContext.socketFactory)
            }
        } else {
            builder.usePlaintext()
        }

        channel = builder.build()
        Timber.d("gRPC channel connected to %s:%d", host, port)
        return channel!!
    }

    fun getChannel(): ManagedChannel {
        return channel ?: throw IllegalStateException("gRPC channel not initialized. Call connect() first.")
    }

    fun isConnected(): Boolean {
        return channel != null && !channel!!.isShutdown && !channel!!.isTerminated
    }

    fun shutdown() {
        channel?.let {
            if (!it.isShutdown) {
                try {
                    it.shutdown().awaitTermination(5, TimeUnit.SECONDS)
                } catch (e: InterruptedException) {
                    Timber.w(e, "gRPC channel shutdown interrupted, forcing shutdown")
                    it.shutdownNow()
                }
            }
        }
        channel = null
    }
}
