package co.kauper.kineticui.demo

import android.content.Context
import androidx.core.content.edit
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * UI state of the debug sheet, shared by the Debug tag, the status pill and the sheet (the Android
 * counterpart of the web demo's `debugUi.ts`).
 */
class DebugUi(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    /** The bottom sheet is open. */
    var isOpen by mutableStateOf(false)
        private set

    /** "Keep readout on screen": default on, remembered per install. */
    var pinned by mutableStateOf(runCatching { preferences.getBoolean(KEY_PINNED, true) }.getOrDefault(true))
        private set

    /** The status pill shows only after Debug was opened once this session. */
    var shown by mutableStateOf(false)
        private set

    fun open() {
        isOpen = true
        shown = true
    }

    fun close() {
        isOpen = false
    }

    fun pin(on: Boolean) {
        pinned = on
        runCatching { preferences.edit { putBoolean(KEY_PINNED, on) } }
    }

    private companion object {
        const val PREFERENCES = "kinetic-ui-demo"
        const val KEY_PINNED = "debug-readout"
    }
}
