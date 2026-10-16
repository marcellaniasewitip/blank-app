package com.cooperwaters.core

import com.cooperwaters.core.net.ApiError
import com.cooperwaters.core.net.ErrorCodes
import com.cooperwaters.core.net.ErrorParser
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class ErrorParserTest {
    @Test fun parsesEnvelopeWithDetails() {
        val body = """{"error":{"code":"wallet_below_minimum","message":"Top up your wallet to at least K50.00 to go online","details":{"balanceToea":1200,"minBalanceToea":5000}}}"""
        val e = ErrorParser.parse(409, body)
        assertEquals(ApiError.Kind.HTTP, e.kind)
        assertEquals(ErrorCodes.WALLET_BELOW_MINIMUM, e.code)
        assertEquals("Top up your wallet to at least K50.00 to go online", e.message)
        assertEquals(409, e.httpStatus)
        assertEquals("5000", e.details!!.jsonObject["minBalanceToea"]!!.jsonPrimitive.content)
        assertFalse(e.isTransient)
    }

    @Test fun parsesOrderTaken() {
        val e = ErrorParser.parse(409, """{"error":{"code":"order_taken","message":"Sorry, this job has already been taken"}}""")
        assertTrue(e.hasCode(ErrorCodes.ORDER_TAKEN))
        assertNull(e.details)
    }

    @Test fun requestInProgressAndServerErrorsAreTransient() {
        assertTrue(ErrorParser.parse(409, """{"error":{"code":"request_in_progress","message":"Retry shortly."}}""").isTransient)
        assertTrue(ErrorParser.parse(503, "<html>Bad gateway</html>").isTransient)
        assertTrue(ErrorParser.parse(429, """{"error":{"code":"rate_limited","message":"Too many"}}""").isTransient)
        assertFalse(ErrorParser.parse(422, """{"error":{"code":"otp_invalid","message":"Wrong code"}}""").isTransient)
    }

    @Test fun junkBodyFallsBackToStatusCode() {
        val e = ErrorParser.parse(404, "<html>captive portal</html>")
        assertEquals("not_found", e.code)
        assertNull(e.message)
        assertEquals("server_error", ErrorParser.parse(500, null).code)
        assertEquals(ErrorCodes.RATE_LIMITED, ErrorParser.parse(429, "").code)
    }

    @Test fun unknownFieldsIgnored() {
        val e = ErrorParser.parse(400, """{"error":{"code":"validation_failed","message":"Validation failed","details":["phone too short"],"extra":1},"x":2}""")
        assertEquals("validation_failed", e.code)
        assertEquals("Validation failed", e.message)
    }

    @Test fun mapsThrowables() {
        val http = HttpException(Response.error<Any>(409, """{"error":{"code":"cancel_not_allowed","message":"No"}}""".toResponseBody("application/json".toMediaType())))
        assertEquals(ErrorCodes.CANCEL_NOT_ALLOWED, ErrorParser.fromThrowable(http).code)
        val net = ErrorParser.fromThrowable(IOException("timeout"))
        assertTrue(net.isNetwork)
        assertTrue(net.isTransient)
        assertNull(net.message)
    }
}
