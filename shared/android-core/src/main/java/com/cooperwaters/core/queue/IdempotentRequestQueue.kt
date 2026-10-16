package com.cooperwaters.core.queue

import com.cooperwaters.core.net.ApiError
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.CwJson
import com.cooperwaters.core.net.RetryPolicy
import com.cooperwaters.core.util.Ids
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/**
 * A money/state-changing request the user asked for, persisted with ITS Idempotency-Key
 * and its exact JSON body (the backend rejects a reused key with a different body).
 */
@Serializable
data class PendingAction(
    /** The Idempotency-Key. Generated once when the user taps the button; reused for every retry. */
    val key: String,
    /** e.g. "create_order", "start_payment", "topup", "withdrawal", "accept". */
    val type: String,
    /** Request body JSON (encoded with [CwJson]). */
    val payload: String,
    /** Path parameter (order id), if any. */
    val targetId: String? = null,
    val createdAtMs: Long,
    /** After this the action is dropped instead of retried (e.g. a job offer's expiresAt). */
    val expiresAtMs: Long? = null,
    val attempts: Int = 0,
    val lastErrorCode: String? = null,
)

interface PendingActionStore {
    suspend fun load(): List<PendingAction>
    suspend fun save(actions: List<PendingAction>)
}

class InMemoryPendingActionStore : PendingActionStore {
    @Volatile private var items: List<PendingAction> = emptyList()
    override suspend fun load(): List<PendingAction> = items
    override suspend fun save(actions: List<PendingAction>) {
        items = actions.toList()
    }
}

/** JSON file store; writes atomically (temp file + rename) so a crash can't corrupt the queue. */
class FilePendingActionStore(
    private val file: File,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : PendingActionStore {
    private val serializer = ListSerializer(PendingAction.serializer())

    override suspend fun load(): List<PendingAction> = withContext(io) {
        if (!file.exists()) return@withContext emptyList()
        try {
            CwJson.decodeFromString(serializer, file.readText())
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun save(actions: List<PendingAction>) = withContext(io) {
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(CwJson.encodeToString(serializer, actions))
        if (!tmp.renameTo(file)) {
            // Some filesystems refuse rename-over; fall back to copy.
            file.writeText(tmp.readText())
            tmp.delete()
        }
        Unit
    }
}

sealed interface QueueOutcome<out T> {
    data class Success<T>(val value: T) : QueueOutcome<T>

    /** Permanent failure (validation, order_taken, …). The action was removed; show [error]. */
    data class Failed(val error: ApiError) : QueueOutcome<Nothing>

    /**
     * Still no definitive answer after the retries (offline / 5xx / request_in_progress).
     * The action STAYS persisted with the same key and will be retried later (drain or user tap).
     */
    data class StillPending(val error: ApiError) : QueueOutcome<Nothing>

    /** The action passed its expiry and was dropped without sending. */
    data object Expired : QueueOutcome<Nothing>

    /** Another caller already completed or is running this action. Refresh state from the server. */
    data object AlreadyHandled : QueueOutcome<Nothing>
}

/**
 * Persisted queue of idempotent requests (create order, start payment, top-up, withdrawal, accept).
 *
 * Contract:
 *  1. [create] is called once per user tap: a new UUID key + the exact body are saved to disk BEFORE sending.
 *  2. [run] sends it, retrying transient failures with backoff — always with the SAME key — so a request that
 *     reached the server but whose response was lost is replayed by the backend, never executed twice.
 *  3. If the app dies or stays offline, the action survives on disk; [drain] (on start / reconnect) or a
 *     later [run] resends it with the same key and the same body.
 */
class IdempotentRequestQueue(
    private val store: PendingActionStore,
    private val policy: RetryPolicy = RetryPolicy(),
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val sleeper: suspend (Long) -> Unit = { delay(it) },
    private val keyFactory: () -> String = { Ids.newIdempotencyKey() },
) {
    private val mutex = Mutex()
    private val running = mutableSetOf<String>()
    private var loaded = false
    private val _pending = MutableStateFlow<List<PendingAction>>(emptyList())

    /** Observable list of actions not yet confirmed by the server (for "waiting to send" UI). */
    val pending: StateFlow<List<PendingAction>> = _pending.asStateFlow()

    private suspend fun ensureLoaded() {
        if (!loaded) {
            _pending.value = store.load()
            loaded = true
        }
    }

    private suspend fun persist(list: List<PendingAction>) {
        _pending.value = list
        store.save(list)
    }

    suspend fun init() = mutex.withLock { ensureLoaded() }

    /** Persist a new action with a fresh Idempotency-Key. */
    suspend fun <B> create(
        type: String,
        bodySerializer: KSerializer<B>,
        body: B,
        targetId: String? = null,
        expiresAtMs: Long? = null,
    ): PendingAction = mutex.withLock {
        ensureLoaded()
        val action = PendingAction(
            key = keyFactory(),
            type = type,
            payload = CwJson.encodeToString(bodySerializer, body),
            targetId = targetId,
            createdAtMs = clock(),
            expiresAtMs = expiresAtMs,
        )
        persist(_pending.value + action)
        action
    }

    suspend fun all(): List<PendingAction> = mutex.withLock {
        ensureLoaded()
        _pending.value
    }

    /** Pending actions of [type] (optionally for one target), oldest first. */
    suspend fun find(type: String, targetId: String? = null): List<PendingAction> =
        all().filter { it.type == type && (targetId == null || it.targetId == targetId) }.sortedBy { it.createdAtMs }

    suspend fun discard(key: String) = mutex.withLock {
        ensureLoaded()
        persist(_pending.value.filterNot { it.key == key })
    }

    /**
     * Send [action] via [call] (which receives the idempotency key), retrying transient failures up to
     * [RetryPolicy.maxAttempts] times with backoff. The same key is passed on every attempt.
     */
    suspend fun <T> run(action: PendingAction, call: suspend (key: String) -> ApiResult<T>): QueueOutcome<T> {
        val claimed = mutex.withLock {
            ensureLoaded()
            if (action.key in running || _pending.value.none { it.key == action.key }) {
                false
            } else {
                running += action.key
                true
            }
        }
        if (!claimed) return QueueOutcome.AlreadyHandled
        try {
            var attempt = 0
            while (true) {
                val exp = action.expiresAtMs
                if (exp != null && clock() > exp) {
                    discard(action.key)
                    return QueueOutcome.Expired
                }
                when (val result = call(action.key)) {
                    is ApiResult.Success -> {
                        discard(action.key)
                        return QueueOutcome.Success(result.value)
                    }
                    is ApiResult.Failure -> {
                        val err = result.error
                        if (!err.isTransient) {
                            discard(action.key)
                            return QueueOutcome.Failed(err)
                        }
                        recordAttempt(action.key, err)
                        if (attempt >= policy.maxAttempts - 1) return QueueOutcome.StillPending(err)
                        sleeper(policy.delayForAttempt(attempt))
                        attempt++
                    }
                }
            }
        } finally {
            mutex.withLock { running -= action.key }
        }
    }

    /**
     * Resend everything still pending (call on app start and when connectivity returns).
     * [handlers] maps action type → the call to make (key and persisted payload are in the action).
     * Actions with no handler are left alone. Returns the outcomes by key.
     */
    suspend fun drain(handlers: Map<String, suspend (PendingAction) -> ApiResult<*>>): Map<String, QueueOutcome<*>> {
        val out = linkedMapOf<String, QueueOutcome<*>>()
        for (action in all().sortedBy { it.createdAtMs }) {
            val handler = handlers[action.type] ?: continue
            out[action.key] = run(action) { _ -> handler(action) }
        }
        return out
    }

    private suspend fun recordAttempt(key: String, err: ApiError) = mutex.withLock {
        persist(_pending.value.map { if (it.key == key) it.copy(attempts = it.attempts + 1, lastErrorCode = err.code) else it })
    }

    companion object {
        /** Decode a persisted payload back into its request body. */
        fun <B> decodeBody(action: PendingAction, serializer: KSerializer<B>): B = CwJson.decodeFromString(serializer, action.payload)
    }
}
