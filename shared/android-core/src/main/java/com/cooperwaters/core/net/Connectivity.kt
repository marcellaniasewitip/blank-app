package com.cooperwaters.core.net

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Online/offline signal for connectivity-aware UI. Android impl: core.android.AndroidConnectivityMonitor. */
interface ConnectivityMonitor {
    val isOnline: StateFlow<Boolean>
}

class FixedConnectivity(online: Boolean = true) : ConnectivityMonitor {
    override val isOnline: StateFlow<Boolean> = MutableStateFlow(online)
}
