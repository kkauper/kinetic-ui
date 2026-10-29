package co.kauper.kineticui

import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.DetectedActivity
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import uniffi.kinetic.ActivityKind

class TransitionTrackerTest {
    private fun enter(type: Int) = TransitionTracker.Event(type, TransitionTracker.ENTER)
    private fun exit(type: Int) = TransitionTracker.Event(type, TransitionTracker.EXIT)

    @Test
    fun `constants match Play services`() {
        assertEquals(DetectedActivity.IN_VEHICLE, TransitionTracker.IN_VEHICLE)
        assertEquals(DetectedActivity.ON_BICYCLE, TransitionTracker.ON_BICYCLE)
        assertEquals(DetectedActivity.STILL, TransitionTracker.STILL)
        assertEquals(DetectedActivity.WALKING, TransitionTracker.WALKING)
        assertEquals(DetectedActivity.RUNNING, TransitionTracker.RUNNING)
        assertEquals(ActivityTransition.ACTIVITY_TRANSITION_ENTER, TransitionTracker.ENTER)
        assertEquals(ActivityTransition.ACTIVITY_TRANSITION_EXIT, TransitionTracker.EXIT)
    }

    @Test
    fun `enter maps to the activity`() {
        val tracker = TransitionTracker()
        assertEquals(ActivityKind.WALKING, tracker.onEvents(listOf(enter(TransitionTracker.WALKING))))
        assertEquals(ActivityKind.CYCLING, tracker.onEvents(listOf(enter(TransitionTracker.ON_BICYCLE))))
        assertEquals(ActivityKind.AUTOMOTIVE, tracker.onEvents(listOf(enter(TransitionTracker.IN_VEHICLE))))
        assertEquals(ActivityKind.RUNNING, tracker.onEvents(listOf(enter(TransitionTracker.RUNNING))))
        assertEquals(ActivityKind.STATIONARY, tracker.onEvents(listOf(enter(TransitionTracker.STILL))))
    }

    @Test
    fun `exit of the current activity without a new enter is unknown`() {
        val tracker = TransitionTracker()
        tracker.onEvents(listOf(enter(TransitionTracker.WALKING)))
        assertEquals(ActivityKind.UNKNOWN, tracker.onEvents(listOf(exit(TransitionTracker.WALKING))))
    }

    @Test
    fun `exit and enter in one batch report the new activity`() {
        val tracker = TransitionTracker()
        tracker.onEvents(listOf(enter(TransitionTracker.WALKING)))
        val batch = listOf(exit(TransitionTracker.WALKING), enter(TransitionTracker.STILL))
        assertEquals(ActivityKind.STATIONARY, tracker.onEvents(batch))
    }

    @Test
    fun `exit of an activity that is not current is ignored`() {
        val tracker = TransitionTracker()
        tracker.onEvents(listOf(enter(TransitionTracker.WALKING)))
        assertNull(tracker.onEvents(listOf(exit(TransitionTracker.STILL))))
        assertNull(tracker.onEvents(listOf(enter(99))))
    }
}
