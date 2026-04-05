package com.mdm.agent.service.agent

import com.mdm.agent.core.database.dao.CommandDao
import com.mdm.agent.core.database.dao.DeviceDao
import com.mdm.agent.core.database.entity.CommandEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CommandDispatcher @Inject constructor(
    private val commandDao: CommandDao,
    private val deviceDao: DeviceDao,
) {
    private var listenerJob: Job? = null
    private val commandHandlers = mutableMapOf<String, CommandHandler>()

    fun interface CommandHandler {
        suspend fun execute(command: CommandEntity): CommandResult
    }

    data class CommandResult(
        val success: Boolean,
        val message: String? = null,
    )

    fun registerHandler(commandType: String, handler: CommandHandler) {
        commandHandlers[commandType] = handler
        Timber.d("Registered handler for command type: %s", commandType)
    }

    fun startListening() {
        stopListening()

        listenerJob = CoroutineScope(Dispatchers.IO).launch {
            Timber.d("Command dispatcher started")
            while (isActive) {
                processPendingCommands()
                delay(5_000)
            }
        }
    }

    fun stopListening() {
        listenerJob?.cancel()
        listenerJob = null
    }

    suspend fun dispatchCommand(command: CommandEntity) {
        commandDao.insertCommand(command)
        executeCommand(command)
    }

    private suspend fun processPendingCommands() {
        val pending = commandDao.getPendingCommands()
        for (command in pending) {
            executeCommand(command)
        }
    }

    private suspend fun executeCommand(command: CommandEntity) {
        val handler = commandHandlers[command.commandType]
        if (handler == null) {
            Timber.w("No handler registered for command type: %s", command.commandType)
            commandDao.updateCommandStatus(
                commandId = command.commandId,
                status = "FAILED",
                executedAt = System.currentTimeMillis(),
                resultMessage = "No handler for command type: ${command.commandType}",
            )
            return
        }

        try {
            Timber.d("Executing command: id=%s, type=%s", command.commandId, command.commandType)
            val result = handler.execute(command)

            commandDao.updateCommandStatus(
                commandId = command.commandId,
                status = if (result.success) "COMPLETED" else "FAILED",
                executedAt = System.currentTimeMillis(),
                resultMessage = result.message,
            )

            Timber.d("Command %s %s: %s",
                command.commandId,
                if (result.success) "completed" else "failed",
                result.message
            )
        } catch (e: Exception) {
            Timber.e(e, "Command execution failed: %s", command.commandId)
            commandDao.incrementRetryCount(command.commandId)
            commandDao.updateCommandStatus(
                commandId = command.commandId,
                status = "FAILED",
                executedAt = System.currentTimeMillis(),
                resultMessage = e.message,
            )
        }
    }

    fun isListening(): Boolean = listenerJob?.isActive == true
}
