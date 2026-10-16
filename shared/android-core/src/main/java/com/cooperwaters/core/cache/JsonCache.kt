package com.cooperwaters.core.cache

import com.cooperwaters.core.net.CwJson
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import java.io.File

/**
 * Tiny last-known-state cache (orders, wallet, profile, packages…) so screens render offline.
 * One JSON file per key under [dir]. Values are advisory: always refresh from the server when online.
 */
class JsonCache(
    private val dir: File,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    private fun fileFor(key: String) = File(dir, key.replace(Regex("[^A-Za-z0-9_.-]"), "_") + ".json")

    suspend fun <T> put(key: String, serializer: KSerializer<T>, value: T) = withContext(io) {
        try {
            dir.mkdirs()
            val f = fileFor(key)
            val tmp = File(dir, f.name + ".tmp")
            tmp.writeText(CwJson.encodeToString(serializer, value))
            if (!tmp.renameTo(f)) {
                f.writeText(tmp.readText())
                tmp.delete()
            }
        } catch (e: Exception) {
            // Cache is best-effort.
        }
        Unit
    }

    suspend fun <T> get(key: String, serializer: KSerializer<T>): T? = withContext(io) {
        val f = fileFor(key)
        if (!f.exists()) return@withContext null
        try {
            CwJson.decodeFromString(serializer, f.readText())
        } catch (e: Exception) {
            null
        }
    }

    suspend fun remove(key: String) = withContext(io) {
        fileFor(key).delete()
        Unit
    }

    suspend fun clear() = withContext(io) {
        dir.listFiles()?.forEach { it.delete() }
        Unit
    }
}

/** A value from the server, or the last cached copy when the server can't be reached. */
data class Loaded<T>(
    val value: T?,
    /** True when [value] came from the on-device cache (show "offline / last updated" hints). */
    val fromCache: Boolean,
    /** The failure that forced the cache fallback (or that left us with nothing). */
    val error: com.cooperwaters.core.net.ApiError?,
)

/** Fetch from the server and cache it; on failure fall back to the cached copy. */
suspend fun <T> JsonCache.fetchOrCached(
    key: String,
    serializer: KSerializer<T>,
    fetch: suspend () -> com.cooperwaters.core.net.ApiResult<T>,
): Loaded<T> = when (val r = fetch()) {
    is com.cooperwaters.core.net.ApiResult.Success -> {
        put(key, serializer, r.value)
        Loaded(r.value, fromCache = false, error = null)
    }
    is com.cooperwaters.core.net.ApiResult.Failure -> {
        val cached = get(key, serializer)
        Loaded(cached, fromCache = cached != null, error = r.error)
    }
}
