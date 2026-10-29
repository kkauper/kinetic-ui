package co.kauper.kineticui

import uniffi.kinetic.Sample

/**
 * An input device for the motion engine. A source translates a platform signal (a switch, the
 * accelerometer, the OS activity classifier) into engine [Sample]s stamped with [Now].
 */
interface MotionSource {
    /** Stable identifier shown in the debug readout, for example `"accelerometer"`. */
    val id: String

    /**
     * Starts producing samples through [emit] (any thread). Returns once the source is running;
     * throws [KineticSourceException] with a message fit for the user when it cannot start.
     */
    suspend fun start(now: Now, emit: (Sample) -> Unit)

    /** Stops producing samples and releases platform resources. Safe to call more than once. */
    fun stop()
}

/** A source could not start. [message] is written for the user, not for a log. */
class KineticSourceException(message: String, cause: Throwable? = null) : Exception(message, cause)
