package com.cooperwaters.core.util

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

object Geo {
    /** Port Moresby city centre — default map centre. */
    const val POM_LAT = -9.4438
    const val POM_LNG = 147.1803

    /** Great-circle distance in metres. */
    fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return 2 * r * asin(sqrt(a))
    }

    /** "850 m" / "3.2 km". */
    fun formatDistance(m: Double): String = if (m < 1000) "${m.toInt()} m" else "%.1f km".format(java.util.Locale.ROOT, m / 1000)
}
