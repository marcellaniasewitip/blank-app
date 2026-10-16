package com.cooperwaters.core.net

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/** Error codes the apps handle specially (backend common/errors.ts + services). */
object ErrorCodes {
    const val ORDER_TAKEN = "order_taken"
    const val WALLET_BELOW_MINIMUM = "wallet_below_minimum"
    const val NOT_AT_DEPOT = "not_at_depot"
    const val CANCEL_NOT_ALLOWED = "cancel_not_allowed"
    const val OTP_INVALID = "otp_invalid"
    const val RATE_LIMITED = "rate_limited"
    const val REQUEST_IN_PROGRESS = "request_in_progress"
    const val UNAUTHORIZED = "unauthorized"
    const val DRIVER_BUSY = "driver_busy"
    const val DRIVER_OFFLINE = "driver_offline"
    const val DISPUTE_OPEN = "dispute_open"

    /** Client-side pseudo codes. */
    const val NETWORK = "network_error"
    const val PARSE = "parse_error"
    const val UNKNOWN = "unknown_error"
}

/**
 * A failed API call. [message] is the server's user-facing text (show it as-is) or null when
 * the failure happened on the device (no network etc.) — the UI then shows a localised string.
 */
data class ApiError(
    val kind: Kind,
    val code: String,
    val message: String?,
    val httpStatus: Int? = null,
    val details: JsonElement? = null,
    val cause: Throwable? = null,
) {
    enum class Kind { NETWORK, HTTP, PARSE, UNKNOWN }

    val isNetwork: Boolean get() = kind == Kind.NETWORK

    /**
     * Worth retrying with the SAME idempotency key: no response at all, server errors,
     * "same request still being processed", rate limiting, and unreadable bodies (a captive portal or
     * proxy page — the request may have reached the server, so the key must NOT be thrown away).
     */
    val isTransient: Boolean
        get() = kind == Kind.NETWORK ||
            kind == Kind.PARSE ||
            (httpStatus != null && httpStatus >= 500) ||
            code == ErrorCodes.REQUEST_IN_PROGRESS ||
            httpStatus == 429

    fun hasCode(c: String): Boolean = code == c

    companion object {
        fun network(cause: Throwable? = null) = ApiError(Kind.NETWORK, ErrorCodes.NETWORK, null, cause = cause)
    }
}

class ApiException(val error: ApiError) : Exception(error.message ?: error.code, error.cause)

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(val error: ApiError) : ApiResult<Nothing>

    fun getOrNull(): T? = (this as? Success)?.value
    fun errorOrNull(): ApiError? = (this as? Failure)?.error
}

inline fun <T, R> ApiResult<T>.map(f: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(f(value))
    is ApiResult.Failure -> this
}

inline fun <T> ApiResult<T>.onSuccess(f: (T) -> Unit): ApiResult<T> {
    if (this is ApiResult.Success) f(value)
    return this
}

inline fun <T> ApiResult<T>.onFailure(f: (ApiError) -> Unit): ApiResult<T> {
    if (this is ApiResult.Failure) f(error)
    return this
}

object ErrorParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    /** Parse the `{ error: { code, message, details } }` envelope; tolerant of junk bodies (proxies, captive portals). */
    fun parse(httpStatus: Int, body: String?): ApiError {
        val parsed = body?.takeIf { it.isNotBlank() }?.let {
            try {
                json.decodeFromString(ErrorEnvelope.serializer(), it).error
            } catch (e: Exception) {
                null
            }
        }
        val code = parsed?.code ?: fallbackCode(httpStatus)
        return ApiError(ApiError.Kind.HTTP, code, parsed?.message, httpStatus, parsed?.details)
    }

    fun fallbackCode(status: Int): String = when (status) {
        401 -> "unauthorized"
        403 -> "forbidden"
        404 -> "not_found"
        409 -> "conflict"
        422 -> "invalid"
        429 -> ErrorCodes.RATE_LIMITED
        in 500..599 -> "server_error"
        else -> "http_error"
    }

    fun fromThrowable(t: Throwable): ApiError = when (t) {
        is ApiException -> t.error
        is HttpException -> parse(t.code(), t.response()?.errorBody()?.string())
        is IOException -> ApiError.network(t)
        is SerializationException -> ApiError(ApiError.Kind.PARSE, ErrorCodes.PARSE, null, cause = t)
        is IllegalArgumentException -> ApiError(ApiError.Kind.PARSE, ErrorCodes.PARSE, null, cause = t)
        else -> ApiError(ApiError.Kind.UNKNOWN, ErrorCodes.UNKNOWN, null, cause = t)
    }
}

/** Run a Retrofit call and turn every failure into an [ApiResult.Failure]. Cancellation is rethrown. */
suspend fun <T> apiCall(block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Success(block())
} catch (e: CancellationException) {
    throw e
} catch (t: Throwable) {
    ApiResult.Failure(ErrorParser.fromThrowable(t))
}

/** For endpoints declared as `Response<T>` (204s, or bodies that may be `null`). */
suspend fun <T> apiResponse(block: suspend () -> Response<T>): ApiResult<T?> = try {
    val r = block()
    if (r.isSuccessful) ApiResult.Success(r.body()) else ApiResult.Failure(ErrorParser.parse(r.code(), r.errorBody()?.string()))
} catch (e: CancellationException) {
    throw e
} catch (t: Throwable) {
    ApiResult.Failure(ErrorParser.fromThrowable(t))
}
