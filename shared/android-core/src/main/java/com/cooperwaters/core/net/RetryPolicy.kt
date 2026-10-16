package com.cooperwaters.core.net

import kotlin.math.min
import kotlin.random.Random

/**
 * Exponential backoff with jitter for unreliable mobile networks (3G in Port Moresby).
 * attempt is 0-based: the delay BEFORE retry number attempt+1.
 */
data class RetryPolicy(
    val maxAttempts: Int = 4,
    val baseDelayMs: Long = 1_000,
    val maxDelayMs: Long = 15_000,
    /** 0.0 = no jitter, 0.5 = delay is randomised between 50% and 100% of the backoff. */
    val jitter: Double = 0.5,
    val random: Random = Random.Default,
) {
    init {
        require(maxAttempts >= 1)
        require(jitter in 0.0..1.0)
    }

    fun delayForAttempt(attempt: Int): Long {
        val shift = attempt.coerceIn(0, 20)
        val exp = min(maxDelayMs, baseDelayMs * (1L shl shift))
        if (jitter == 0.0) return exp
        val factor = 1.0 - jitter * random.nextDouble()
        return (exp * factor).toLong().coerceAtLeast(1)
    }

    companion object {
        val NONE = RetryPolicy(maxAttempts = 1, jitter = 0.0)
    }
}
