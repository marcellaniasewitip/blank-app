package com.cooperwaters.core

import com.cooperwaters.core.time.PomTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class PomTimeTest {
    @Test fun displaysUtcInPortMoresbyTime() {
        // 05:51 UTC is 15:51 in Port Moresby (UTC+10, no DST).
        assertEquals("16 Oct 2026, 3:51 PM", PomTime.formatDateTime("2026-10-16T05:51:55.898Z"))
        assertEquals("3:51 PM", PomTime.formatTime("2026-10-16T05:51:55Z"))
        assertEquals("16 Oct 2026", PomTime.formatDate("2026-10-16T05:51:55Z"))
    }

    @Test fun crossesMidnightIntoNextLocalDay() {
        // 20:30 UTC on 31 Dec = 06:30 on 1 Jan local.
        assertEquals("1 Jan 2027, 6:30 AM", PomTime.formatDateTime("2026-12-31T20:30:00Z"))
    }

    @Test fun noDaylightSaving() {
        assertEquals("1 Jul 2026, 10:00 AM", PomTime.formatDateTime("2026-07-01T00:00:00Z"))
        assertEquals("1 Jan 2026, 10:00 AM", PomTime.formatDateTime("2026-01-01T00:00:00Z"))
    }

    @Test fun acceptsOffsetTimestamps() {
        assertEquals("16 Oct 2026, 3:51 PM", PomTime.formatDateTime("2026-10-16T15:51:00+10:00"))
    }

    @Test fun invalidOrMissingIsEmpty() {
        assertEquals("", PomTime.formatDateTime(null))
        assertEquals("", PomTime.formatDateTime("not a date"))
        assertNull(PomTime.parse(""))
    }

    @Test fun countdown() {
        val now = Instant.parse("2026-10-16T05:00:00Z")
        assertEquals(300L, PomTime.secondsUntil("2026-10-16T05:05:00Z", now))
        assertEquals(-60L, PomTime.secondsUntil("2026-10-16T04:59:00Z", now))
        assertNull(PomTime.secondsUntil(null, now))
        assertEquals("5:00", PomTime.formatCountdown(300))
        assertEquals("0:09", PomTime.formatCountdown(9))
        assertEquals("1:02:05", PomTime.formatCountdown(3725))
        assertEquals("0:00", PomTime.formatCountdown(-5))
    }

    @Test fun nowIsoIsUtc() {
        assertEquals("2026-10-16T05:00:00Z", PomTime.nowIso(Instant.parse("2026-10-16T05:00:00Z")))
    }
}
