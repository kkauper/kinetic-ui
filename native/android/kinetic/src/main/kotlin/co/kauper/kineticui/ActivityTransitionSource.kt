package co.kauper.kineticui

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.tasks.Task
import kotlin.coroutines.cancellation.CancellationException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import uniffi.kinetic.Sample

/**
 * The OS activity classifier via Google Play services' Activity Recognition *Transition* API. It is
 * battery-friendly and needs no sensor handling, but reports transitions, not a stream, and "latency
 * of event detection might vary by device"; expect seconds, not milliseconds.
 *
 * Requires the runtime permission `ACTIVITY_RECOGNITION` (Android 10+); the caller asks for it, this
 * source only checks and throws a [KineticSourceException] that says what to do.
 *
 * Delivery: an explicit, mutable [PendingIntent] (Play services must add the result extras, so it
 * cannot be immutable; Android 14+ rejects mutable PendingIntents with implicit intents) that goes to
 * a receiver registered at runtime as not exported. That combination is documented to work but has
 * not been confirmed on a device; see DECISIONS.md.
 */
class ActivityTransitionSource(context: Context) : MotionSource {
    override val id: String = "activity-transitions"

    private val appContext = context.applicationContext
    private val action = "${appContext.packageName}.KINETIC_ACTIVITY_TRANSITION"
    private val lock = Any()
    private var receiver: BroadcastReceiver? = null
    private var pendingIntent: PendingIntent? = null

    override suspend fun start(now: Now, emit: (Sample) -> Unit) {
        if (synchronized(lock) { receiver != null }) return
        if (!isAvailable(appContext)) {
            throw KineticSourceException(
                "Google Play services isn't available on this device. Use the accelerometer instead.",
            )
        }
        if (!hasPermission(appContext)) {
            throw KineticSourceException(
                "Walking mode needs permission to recognise your physical activity. Allow it and try again.",
            )
        }

        val tracker = TransitionTracker()
        val newReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (!ActivityTransitionResult.hasResult(intent)) return
                val result = ActivityTransitionResult.extractResult(intent) ?: return
                val events = result.transitionEvents.map {
                    TransitionTracker.Event(it.activityType, it.transitionType)
                }
                val activity = tracker.onEvents(events) ?: return
                emit(Sample.Activity(now.ms(), activity, 1.0))
            }
        }
        val intent = Intent(action).setPackage(appContext.packageName)
        val pending = PendingIntent.getBroadcast(
            appContext,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag(),
        )
        ContextCompat.registerReceiver(appContext, newReceiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
        synchronized(lock) {
            receiver = newReceiver
            pendingIntent = pending
        }

        try {
            ActivityRecognition.getClient(appContext)
                .requestActivityTransitionUpdates(request(), pending)
                .await()
        } catch (e: CancellationException) {
            stop()
            throw e
        } catch (e: Exception) {
            stop()
            throw KineticSourceException("Walking mode couldn't start: ${e.message ?: "unknown error"}", e)
        }
    }

    override fun stop() {
        val (oldReceiver, oldPending) = synchronized(lock) {
            val pair = receiver to pendingIntent
            receiver = null
            pendingIntent = null
            pair
        }
        if (oldPending != null) {
            // Best effort: the task result is not awaited, there is nobody to tell.
            runCatching { ActivityRecognition.getClient(appContext).removeActivityTransitionUpdates(oldPending) }
            oldPending.cancel()
        }
        if (oldReceiver != null) runCatching { appContext.unregisterReceiver(oldReceiver) }
    }

    private fun request(): ActivityTransitionRequest {
        val kinds = listOf(ActivityTransition.ACTIVITY_TRANSITION_ENTER, ActivityTransition.ACTIVITY_TRANSITION_EXIT)
        val transitions = TransitionTracker.SUPPORTED_TYPES.flatMap { type ->
            kinds.map { kind ->
                ActivityTransition.Builder().setActivityType(type).setActivityTransition(kind).build()
            }
        }
        return ActivityTransitionRequest(transitions)
    }

    companion object {
        private const val REQUEST_CODE = 0x4B49

        /** Whether Google Play services can serve the Transition API on this device. */
        fun isAvailable(context: Context): Boolean =
            GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS

        /**
         * Whether the activity-recognition permission is granted. Below Android 10 it is an install-time
         * permission (declared in this library's manifest), so there is nothing to ask.
         */
        fun hasPermission(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) ==
                PackageManager.PERMISSION_GRANTED

        private fun mutableFlag(): Int =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    }
}

/** Awaits a Play services [Task] without a dependency on kotlinx-coroutines-play-services. */
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { continuation.resume(it) }
    addOnFailureListener { continuation.resumeWithException(it) }
    addOnCanceledListener { continuation.cancel() }
}
