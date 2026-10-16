package com.cooperwaters.core

import com.cooperwaters.core.net.ApiError
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.CreateOrderRequest
import com.cooperwaters.core.net.ErrorParser
import com.cooperwaters.core.net.RetryPolicy
import com.cooperwaters.core.queue.FilePendingActionStore
import com.cooperwaters.core.queue.IdempotentRequestQueue
import com.cooperwaters.core.queue.InMemoryPendingActionStore
import com.cooperwaters.core.queue.QueueOutcome
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class IdempotentRequestQueueTest {
    @get:Rule val tmp = TemporaryFolder()

    private val body = CreateOrderRequest(packageId = "pkg-1", quantity = 2, locationId = "loc-1", paymentMethod = "cod")
    private val noJitter = RetryPolicy(maxAttempts = 4, baseDelayMs = 1000, maxDelayMs = 8000, jitter = 0.0)
    private var keyCounter = 0
    private fun queue(store: com.cooperwaters.core.queue.PendingActionStore = InMemoryPendingActionStore(), now: () -> Long = { 1_000L }, sleeps: MutableList<Long> = mutableListOf()) =
        IdempotentRequestQueue(store, noJitter, clock = now, sleeper = { sleeps += it }, keyFactory = { "key-${++keyCounter}" })

    @Test fun sameKeyIsReusedAcrossRetries() = runTest {
        val sleeps = mutableListOf<Long>()
        val q = queue(sleeps = sleeps)
        val action = q.create("create_order", CreateOrderRequest.serializer(), body)
        val seenKeys = mutableListOf<String>()
        val outcome = q.run(action) { key ->
            seenKeys += key
            when (seenKeys.size) {
                1 -> ApiResult.Failure(ApiError.network())
                2 -> ApiResult.Failure(ErrorParser.parse(502, null))
                3 -> ApiResult.Failure(ErrorParser.parse(409, """{"error":{"code":"request_in_progress","message":"Retry shortly."}}"""))
                else -> ApiResult.Success("order-123")
            }
        }
        assertEquals(QueueOutcome.Success("order-123"), outcome)
        assertEquals(listOf("key-1", "key-1", "key-1", "key-1"), seenKeys)
        assertEquals(listOf(1000L, 2000L, 4000L), sleeps)
        assertTrue(q.all().isEmpty())
    }

    @Test fun permanentFailureIsNotRetriedAndIsRemoved() = runTest {
        val q = queue()
        val action = q.create("accept", CreateOrderRequest.serializer(), body, targetId = "order-1")
        var calls = 0
        val outcome = q.run(action) {
            calls++
            ApiResult.Failure(ErrorParser.parse(409, """{"error":{"code":"order_taken","message":"Sorry, this job has already been taken"}}"""))
        }
        assertEquals(1, calls)
        assertTrue(outcome is QueueOutcome.Failed && outcome.error.code == "order_taken")
        assertTrue(q.all().isEmpty())
    }

    @Test fun exhaustedRetriesKeepActionPersistedWithSameKeyAcrossRestarts() = runTest {
        val file = tmp.newFile("pending.json")
        val q1 = queue(store = FilePendingActionStore(file, kotlinx.coroutines.Dispatchers.Unconfined))
        val action = q1.create("create_order", CreateOrderRequest.serializer(), body)
        val outcome = q1.run(action) { ApiResult.Failure(ApiError.network()) }
        assertTrue(outcome is QueueOutcome.StillPending)
        assertEquals(4, q1.all().single().attempts)

        // "App restart": a new queue over the same file sees the action with its key and exact body.
        val q2 = queue(store = FilePendingActionStore(file, kotlinx.coroutines.Dispatchers.Unconfined))
        val restored = q2.all().single()
        assertEquals("key-1", restored.key)
        assertEquals(body, IdempotentRequestQueue.decodeBody(restored, CreateOrderRequest.serializer()))

        val sentKeys = mutableListOf<String>()
        val results = q2.drain(mapOf("create_order" to { a -> sentKeys += a.key; ApiResult.Success("ok") }))
        assertEquals(listOf("key-1"), sentKeys)
        assertEquals(QueueOutcome.Success("ok"), results["key-1"])
        assertTrue(q2.all().isEmpty())
        assertTrue(queue(store = FilePendingActionStore(file, kotlinx.coroutines.Dispatchers.Unconfined)).all().isEmpty())
    }

    @Test fun expiredActionIsDroppedWithoutSending() = runTest {
        var now = 1_000L
        val q = queue(now = { now })
        val action = q.create("accept", CreateOrderRequest.serializer(), body, targetId = "o", expiresAtMs = 5_000L)
        now = 6_000L
        var calls = 0
        val outcome = q.run(action) { calls++; ApiResult.Success(Unit) }
        assertEquals(QueueOutcome.Expired, outcome)
        assertEquals(0, calls)
        assertTrue(q.all().isEmpty())
    }

    @Test fun eachTapGetsANewKeyButFindReturnsThePendingOne() = runTest {
        val q = queue()
        val a = q.create("topup", CreateOrderRequest.serializer(), body)
        val b = q.create("withdrawal", CreateOrderRequest.serializer(), body)
        assertTrue(a.key != b.key)
        assertEquals(listOf(a), q.find("topup"))
        q.discard(a.key)
        assertTrue(q.find("topup").isEmpty())
    }

    @Test fun completedActionCannotBeSentAgain() = runTest {
        val q = queue()
        val a = q.create("create_order", CreateOrderRequest.serializer(), body)
        q.run(a) { ApiResult.Success(1) }
        var calls = 0
        val again = q.run(a) { calls++; ApiResult.Success(2) }
        assertEquals(QueueOutcome.AlreadyHandled, again)
        assertEquals(0, calls)
    }

    @Test fun backoffIsCappedAndJittered() {
        val p = RetryPolicy(maxAttempts = 10, baseDelayMs = 1000, maxDelayMs = 15_000, jitter = 0.0)
        assertEquals(listOf(1000L, 2000L, 4000L, 8000L, 15_000L, 15_000L), (0..5).map { p.delayForAttempt(it) })
        val j = RetryPolicy(baseDelayMs = 1000, maxDelayMs = 15_000, jitter = 0.5, random = kotlin.random.Random(42))
        repeat(50) { val d = j.delayForAttempt(2); assertTrue(d in 2000L..4000L) }
    }
}
