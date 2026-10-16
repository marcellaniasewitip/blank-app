package com.cooperwaters.driver.location

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.cooperwaters.core.android.LocationHelper
import com.cooperwaters.core.net.ApiResult
import com.cooperwaters.core.net.LocationBatch
import com.cooperwaters.core.net.LocationPoint
import com.cooperwaters.core.net.apiCall
import com.cooperwaters.core.time.PomTime
import com.cooperwaters.driver.DriverApp
import com.cooperwaters.driver.MainActivity
import com.cooperwaters.driver.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Foreground service (persistent notification) that shares the driver's location while online.
 * Fixes are buffered and sent as one batch every `config.locationIntervalSec` (default 20 s) to
 * POST /driver/location — few radio wake-ups on 3G and kind to the battery. When stationary it still
 * sends the last fix as a heartbeat so dispatch keeps treating the driver as available (last_seen < 2 min).
 */
class LocationTrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val buffer = ArrayDeque<LocationPoint>()
    private var last: Location? = null
    private var started = false

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            last = location
            synchronized(buffer) {
                buffer.addLast(LocationPoint(location.latitude, location.longitude, PomTime.nowIso(Instant.ofEpochMilli(location.time))))
                while (buffer.size > MAX_BUFFER) buffer.removeFirst()
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        override fun onProviderEnabled(provider: String) = Unit
        override fun onProviderDisabled(provider: String) = Unit
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        if (!started) {
            started = true
            requestUpdates()
            scope.launch { flushLoop() }
        }
        return START_STICKY
    }

    private fun startInForeground() {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, getString(R.string.notification_channel_tracking_id))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.tracking_notification_title))
            .setContentText(getString(R.string.tracking_notification_body))
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    }

    @SuppressLint("MissingPermission")
    private fun requestUpdates() {
        if (!LocationHelper.hasPermission(this)) return
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            try {
                if (lm.isProviderEnabled(p)) lm.requestLocationUpdates(p, MIN_TIME_MS, MIN_DISTANCE_M, listener, Looper.getMainLooper())
            } catch (e: Exception) {
                // provider unavailable on this device
            }
        }
        last = LocationHelper.lastKnown(this, Long.MAX_VALUE)
    }

    private suspend fun flushLoop() {
        val container = (application as DriverApp).container
        while (scope.isActive) {
            val intervalSec = container.state.config.value?.locationIntervalSec ?: 20
            delay(intervalSec.coerceIn(15, 30) * 1_000L)
            val points = synchronized(buffer) { buffer.toList() }
            val batch = points.ifEmpty {
                // Heartbeat with the last fix, stamped now.
                last?.let { listOf(LocationPoint(it.latitude, it.longitude, PomTime.nowIso())) }.orEmpty()
            }
            if (batch.isEmpty()) continue
            when (val r = apiCall { container.api.driverApi.sendLocations(LocationBatch(batch.takeLast(MAX_BUFFER))) }) {
                is ApiResult.Success -> {
                    synchronized(buffer) { repeat(points.size.coerceAtMost(buffer.size)) { buffer.removeFirst() } }
                    if (!r.value.online) {
                        // Server took us offline (admin, wallet…): reflect it; DriverApp stops this service.
                        container.state.setOnline(false)
                        container.state.refreshProfile()
                    }
                }
                is ApiResult.Failure -> Unit // keep buffering (bounded); retried next tick
            }
        }
    }

    override fun onDestroy() {
        (getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(listener)
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val NOTIFICATION_ID = 42
        private const val MIN_TIME_MS = 15_000L
        private const val MIN_DISTANCE_M = 20f
        private const val MAX_BUFFER = 100

        fun intent(context: Context) = Intent(context, LocationTrackingService::class.java)
    }
}
