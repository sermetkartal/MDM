package com.mdm.agent.core.network

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.CertificatePinner
import timber.log.Timber
import java.io.InputStream
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.inject.Inject
import javax.inject.Singleton
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

@Singleton
class CertificatePinning @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var pinnedCertificates: List<X509Certificate> = emptyList()
    private var sslContext: SSLContext? = null

    fun loadPinnedCertificates(certStreams: List<InputStream>) {
        val factory = CertificateFactory.getInstance("X.509")
        pinnedCertificates = certStreams.map { stream ->
            stream.use { factory.generateCertificate(it) as X509Certificate }
        }
        sslContext = null
        Timber.d("Loaded %d pinned certificates", pinnedCertificates.size)
    }

    fun createSslContext(): SSLContext? {
        if (pinnedCertificates.isEmpty()) return null

        sslContext?.let { return it }

        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null, null)
            pinnedCertificates.forEachIndexed { index, cert ->
                setCertificateEntry("mdm_cert_$index", cert)
            }
        }

        val trustManagerFactory = TrustManagerFactory.getInstance(
            TrustManagerFactory.getDefaultAlgorithm()
        ).apply {
            init(keyStore)
        }

        val ctx = SSLContext.getInstance("TLS").apply {
            init(null, trustManagerFactory.trustManagers, null)
        }

        sslContext = ctx
        return ctx
    }

    fun getTrustManager(): X509TrustManager? {
        if (pinnedCertificates.isEmpty()) return null

        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null, null)
            pinnedCertificates.forEachIndexed { index, cert ->
                setCertificateEntry("mdm_cert_$index", cert)
            }
        }

        val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        tmf.init(keyStore)
        return tmf.trustManagers.first() as X509TrustManager
    }

    fun buildOkHttpPinner(hostname: String, vararg sha256Hashes: String): CertificatePinner {
        val builder = CertificatePinner.Builder()
        for (hash in sha256Hashes) {
            builder.add(hostname, "sha256/$hash")
        }
        return builder.build()
    }
}
