package com.cooperwaters.core.time

import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/**
 * Timestamps arrive as UTC ISO-8601 (e.g. `2026-10-16T05:51:55.898Z`) and are shown in Port Moresby time
 * (Pacific/Port_Moresby, UTC+10, no DST). java.time works on minSdk 24 via core library desugaring.
 */
object PomTime {
    val ZONE: ZoneId = ZoneId.of("Pacific/Port_Moresby")

    private fun dateTimeFmt(locale: Locale) = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", locale).withZone(ZONE)
    private fun dateFmt(locale: Locale) = DateTimeFormatter.ofPattern("d MMM yyyy", locale).withZone(ZONE)
    private fun timeFmt(locale: Locale) = DateTimeFormatter.ofPattern("h:mm a", locale).withZone(ZONE)

    fun parse(iso: String?): Instant? {
        if (iso.isNullOrBlank()) return null
        return try {
            Instant.parse(iso)
        } catch (e: DateTimeParseException) {
            try {
                OffsetDateTime.parse(iso).toInstant()
            } catch (e2: DateTimeParseException) {
                null
            }
        }
    }

    /** "16 Oct 2026, 3:51 PM" in Port Moresby time; "" when absent/invalid. */
    fun formatDateTime(iso: String?, locale: Locale = Locale.ENGLISH): String =
        parse(iso)?.let { dateTimeFmt(locale).format(it) } ?: ""

    fun formatDate(iso: String?, locale: Locale = Locale.ENGLISH): String =
        parse(iso)?.let { dateFmt(locale).format(it) } ?: ""

    fun formatTime(iso: String?, locale: Locale = Locale.ENGLISH): String =
        parse(iso)?.let { timeFmt(locale).format(it) } ?: ""

    fun formatInstant(instant: Instant, locale: Locale = Locale.ENGLISH): String = dateTimeFmt(locale).format(instant)

    /** Whole seconds from [now] until [iso] (negative once passed); null if no timestamp. */
    fun secondsUntil(iso: String?, now: Instant = Instant.now()): Long? =
        parse(iso)?.let { Duration.between(now, it).seconds }

    /** Countdown text: 125 → "2:05", 3725 → "1:02:05", negatives → "0:00". */
    fun formatCountdown(seconds: Long): String {
        val s = seconds.coerceAtLeast(0)
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        return if (h > 0) "%d:%02d:%02d".format(Locale.ROOT, h, m, sec) else "%d:%02d".format(Locale.ROOT, m, sec)
    }

    /** UTC ISO string for "now" (location fixes). */
    fun nowIso(now: Instant = Instant.now()): String = DateTimeFormatter.ISO_INSTANT.format(now)
}
