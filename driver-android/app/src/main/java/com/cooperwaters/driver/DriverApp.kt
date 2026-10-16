package com.cooperwaters.driver

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.cooperwaters.core.money.Money
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class DriverApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        createChannels()
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                container.foreground.value = true
            }

            override fun onStop(owner: LifecycleOwner) {
                container.foreground.value = false
            }
        })
        val c = container
        // Socket while visible OR online (offers are time-critical); push covers the rest.
        c.appScope.launch {
            combine(c.foreground, c.loggedIn, c.state.profile) { fg, inSession, p -> inSession && (fg || p?.online == true) }
                .distinctUntilChanged()
                .collect { if (it) c.realtime.connect() else c.realtime.disconnect() }
        }
        // The foreground location service runs exactly while the server says we're online.
        c.appScope.launch {
            combine(c.loggedIn, c.state.profile.map { it?.online == true }) { inSession, online -> inSession && online }
                .distinctUntilChanged()
                .collect { c.setTracking(it) }
        }
        // Resend saved idempotent requests when back online.
        c.appScope.launch {
            combine(c.connectivity.isOnline, c.loggedIn) { online, inSession -> online && inSession }
                .distinctUntilChanged()
                .filter { it }
                .collect {
                    c.repository.drainPending()
                    c.state.refreshAll()
                    c.registerPushToken()
                }
        }
        // Heads-up alert for a socket offer while the app is in the background.
        c.appScope.launch {
            c.state.latestNewOffer.filterNotNull().collect { offer ->
                if (!c.foreground.value) notifyOffer(offer.orderId, offer.shortCode, Money.format(offer.earningsToea))
            }
        }
    }

    fun notifyOffer(orderId: String, shortCode: String, earnings: String) {
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pi = PendingIntent.getActivity(this, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(this, getString(R.string.notification_channel_offers_id))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.notification_offer_title))
            .setContentText(getString(R.string.notification_offer_body, shortCode, earnings))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        try {
            NotificationManagerCompat.from(this).notify(orderId.hashCode(), n)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted.
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(getString(R.string.notification_channel_offers_id), getString(R.string.notification_channel_offers), NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel(getString(R.string.notification_channel_jobs_id), getString(R.string.notification_channel_jobs), NotificationManager.IMPORTANCE_DEFAULT))
        nm.createNotificationChannel(NotificationChannel(getString(R.string.notification_channel_tracking_id), getString(R.string.notification_channel_tracking), NotificationManager.IMPORTANCE_LOW))
    }
}
