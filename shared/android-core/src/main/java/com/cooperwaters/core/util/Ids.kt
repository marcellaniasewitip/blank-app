package com.cooperwaters.core.util

import java.util.UUID

object Ids {
    /** A new Idempotency-Key. Generated once per user action (button tap) and reused for all its retries. */
    fun newIdempotencyKey(): String = UUID.randomUUID().toString()
}
