package com.cooperwaters.customer

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.cooperwaters.core.android.ui.CooperWatersTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    /** Order to open, from a notification tap. */
    private val openOrder = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        openOrder.value = intent?.getStringExtra(EXTRA_ORDER_ID)
        setContent {
            CooperWatersTheme {
                CustomerNavHost(openOrder = openOrder)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_ORDER_ID)?.let { openOrder.value = it }
    }

    companion object {
        const val EXTRA_ORDER_ID = "orderId"
    }
}
