package com.cooperwaters.core.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Driver uploads: POST /driver/uploads → pre-signed PUT → caller submits the returned key.
 * Bytes should already be compressed (see core.android.ImageCompressor) — drivers are on 3G.
 */
class Uploader(
    private val driverApi: DriverApi,
    /** Must NOT add the bearer token (S3 pre-signed URLs reject extra auth). */
    private val plainHttp: OkHttpClient,
) {
    suspend fun upload(purpose: String, contentType: String, bytes: ByteArray): ApiResult<String> {
        val ticket = when (val t = apiCall { driverApi.requestUpload(UploadRequest(purpose, contentType, bytes.size.toLong())) }) {
            is ApiResult.Failure -> return t
            is ApiResult.Success -> t.value
        }
        return apiCall {
            withContext(Dispatchers.IO) {
                val builder = Request.Builder().url(ticket.url)
                ticket.headers.forEach { (k, v) -> builder.header(k, v) }
                val body = bytes.toRequestBody((ticket.headers["Content-Type"] ?: contentType).toMediaType())
                builder.method(ticket.method.ifBlank { "PUT" }, body)
                plainHttp.newCall(builder.build()).execute().use { resp ->
                    if (!resp.isSuccessful) throw ApiException(ErrorParser.parse(resp.code, resp.body?.string()))
                }
                ticket.key
            }
        }
    }

    object Purpose {
        const val DOCUMENT = "document"
        const val TOPUP_PROOF = "topup_proof"
        const val PROOF_OF_DELIVERY = "proof_of_delivery"
        const val TRUCK_PHOTO = "truck_photo"
    }
}
