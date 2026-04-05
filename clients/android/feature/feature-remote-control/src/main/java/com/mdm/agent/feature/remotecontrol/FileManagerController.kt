package com.mdm.agent.feature.remotecontrol

import android.content.Context
import android.os.Environment
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FileManagerController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var isActive = false

    fun startSession() {
        isActive = true
        Timber.d("File manager session started")
    }

    fun endSession() {
        isActive = false
        Timber.d("File manager session ended")
    }

    suspend fun listDirectory(path: String): List<FileInfo> = withContext(Dispatchers.IO) {
        if (!isActive) return@withContext emptyList()

        val dir = File(path)
        if (!dir.exists() || !dir.isDirectory) return@withContext emptyList()

        dir.listFiles()?.map { file ->
            FileInfo(
                name = file.name,
                path = file.absolutePath,
                isDirectory = file.isDirectory,
                size = if (file.isFile) file.length() else 0,
                lastModified = file.lastModified(),
            )
        } ?: emptyList()
    }

    suspend fun readFile(path: String): ByteArray? = withContext(Dispatchers.IO) {
        if (!isActive) return@withContext null

        try {
            File(path).readBytes()
        } catch (e: Exception) {
            Timber.e(e, "Failed to read file: %s", path)
            null
        }
    }

    suspend fun deleteFile(path: String): Boolean = withContext(Dispatchers.IO) {
        if (!isActive) return@withContext false

        try {
            File(path).delete()
        } catch (e: Exception) {
            Timber.e(e, "Failed to delete file: %s", path)
            false
        }
    }

    fun isActive(): Boolean = isActive

    data class FileInfo(
        val name: String,
        val path: String,
        val isDirectory: Boolean,
        val size: Long,
        val lastModified: Long,
    )
}
