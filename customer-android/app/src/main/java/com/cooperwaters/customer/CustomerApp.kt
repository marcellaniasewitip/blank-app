package com.cooperwaters.customer

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

class CustomerApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        createNotificationChannels()

        // Realtime only while the app is visible; FCM push is the backup channel in the background.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                container.foreground.value = true
            }

            override fun onStop(owner: LifecycleOwner) {
                container.foreground.value = false
            }
        })
        container.appScope.launch {
            combine(container.foreground, container.loggedIn) { fg, inSession -> fg && inSession }
                .distinctUntilChanged()
                .collect { if (it) container.realtime.connect() else container.realtime.disconnect() }
        }
        // Resend saved idempotent requests (same keys) whenever we're signed in and back online.
        container.appScope.launch {
            combine(container.connectivity.isOnline, container.loggedIn) { online, inSession -> online && inSession }
                .distinctUntilChanged()
                .filter { it }
                .collect {
                    container.repository.drainPending()
                    container.registerPushToken()
                }
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(
                getString(R.string.notification_channel_orders_id),
                getString(R.string.notification_channel_orders),
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
    }
}
