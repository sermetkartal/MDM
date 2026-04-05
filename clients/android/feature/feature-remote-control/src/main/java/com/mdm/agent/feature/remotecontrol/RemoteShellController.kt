package com.mdm.agent.feature.remotecontrol

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.BufferedReader
import java.io.InputStreamReader
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteShellController @Inject constructor() {

    private var isActive = false

    fun startShell() {
        isActive = true
        Timber.d("Remote shell session started")
    }

    fun stopShell() {
        isActive = false
        Timber.d("Remote shell session stopped")
    }

    suspend fun executeCommand(command: String): CommandResult = withContext(Dispatchers.IO) {
        if (!isActive) {
            return@withContext CommandResult("", "Shell session not active", -1)
        }

        try {
            val allowedCommands = ALLOWED_COMMANDS.any { command.startsWith(it) }
            if (!allowedCommands) {
                return@withContext CommandResult("", "Command not allowed: $command", -1)
            }

            val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
            val stdout = BufferedReader(InputStreamReader(process.inputStream)).readText()
            val stderr = BufferedReader(InputStreamReader(process.errorStream)).readText()
            val exitCode = process.waitFor()

            Timber.d("Shell command executed: %s (exit: %d)", command, exitCode)
            CommandResult(stdout, stderr, exitCode)
        } catch (e: Exception) {
            Timber.e(e, "Shell command failed: %s", command)
            CommandResult("", e.message ?: "Unknown error", -1)
        }
    }

    fun isActive(): Boolean = isActive

    data class CommandResult(
        val stdout: String,
        val stderr: String,
        val exitCode: Int,
    )

    companion object {
        private val ALLOWED_COMMANDS = listOf(
            "ls", "cat", "ps", "top", "df", "du", "free",
            "getprop", "dumpsys", "logcat", "pm list", "settings",
        )
    }
}
