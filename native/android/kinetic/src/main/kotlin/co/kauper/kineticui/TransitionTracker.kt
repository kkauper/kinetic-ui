package co.kauper.kineticui

import uniffi.kinetic.ActivityKind

/**
 * Turns Activity Recognition *transitions* into engine activities. Pure Kotlin on plain ints (the
 * `DetectedActivity` / `ActivityTransition` constants), so it is unit-testable without Play services.
 *
 * Transitions carry no confidence, so the engine is told `1.0`. A transition only says "entered X"
 * or "exited X"; after an EXIT of the current activity with no ENTER of another one, we know the
 * user is doing something we cannot name, so [ActivityKind.UNKNOWN] is reported.
 */
internal class TransitionTracker {
    /** One transition event: `DetectedActivity.*` type and `ActivityTransition.ACTIVITY_TRANSITION_*` kind. */
    data class Event(val activityType: Int, val transitionType: Int)

    private var current: ActivityKind? = null

    /**
     * Applies one delivered batch. Returns the activity to report, or null when nothing changed.
     * Within a batch ENTER wins over EXIT, because Play services often delivers EXIT(old) and
     * ENTER(new) together.
     */
    fun onEvents(events: List<Event>): ActivityKind? {
        var entered: ActivityKind? = null
        var exitedCurrent = false
        for (event in events) {
            val kind = activityFor(event.activityType) ?: continue
            when (event.transitionType) {
                ENTER -> entered = kind
                EXIT -> if (kind == current) exitedCurrent = true
            }
        }
        return when {
            entered != null -> entered.also { current = it }
            exitedCurrent -> ActivityKind.UNKNOWN.also { current = null }
            else -> null
        }
    }

    companion object {
        // Values of DetectedActivity.* and ActivityTransition.ACTIVITY_TRANSITION_*; a unit test pins them.
        const val IN_VEHICLE = 0
        const val ON_BICYCLE = 1
        const val STILL = 3
        const val WALKING = 7
        const val RUNNING = 8
        const val ENTER = 0
        const val EXIT = 1

        /** The activity types the Transition API supports (ON_FOOT is not one of them). */
        val SUPPORTED_TYPES = intArrayOf(WALKING, RUNNING, ON_BICYCLE, IN_VEHICLE, STILL)

        fun activityFor(activityType: Int): ActivityKind? = when (activityType) {
            WALKING -> ActivityKind.WALKING
            RUNNING -> ActivityKind.RUNNING
            ON_BICYCLE -> ActivityKind.CYCLING
            IN_VEHICLE -> ActivityKind.AUTOMOTIVE
            STILL -> ActivityKind.STATIONARY
            else -> null
        }
    }
}
