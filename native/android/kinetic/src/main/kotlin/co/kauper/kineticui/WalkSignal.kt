package co.kauper.kineticui

import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random
import uniffi.kinetic.Sample

/**
 * The synthetic walking waveform: gravity on z, a sine swing at [cadence] steps per second and a
 * little noise. The phase advances with the *stamped* time, so a late sample lowers the sample rate
 * but never the frequency, and changing [cadence] keeps the phase continuous. Pure and clock-free.
 */
class WalkSignal(var cadence: Double = 1.8, seed: Int = 1) {
    private val random = Random(seed)
    private var phase = 0.0
    private var lastT: Double? = null

    /** The reading at time [t] (ms). Times must not go backwards. */
    fun sampleAt(t: Double): Sample.Acceleration {
        lastT?.let { phase += 2 * PI * cadence * (t - it) / 1000.0 }
        lastT = t
        val swing = if (cadence > 0) SWING * sin(phase) else 0.0
        return Sample.Acceleration(
            t = t,
            x = (random.nextDouble() - 0.5) * NOISE,
            y = (random.nextDouble() - 0.5) * NOISE,
            z = GRAVITY + swing + (random.nextDouble() - 0.5) * NOISE,
        )
    }

    /** Current phase in radians; exposed for tests. */
    internal val currentPhase: Double get() = phase

    private companion object {
        const val GRAVITY = 9.81
        const val SWING = 3.0
        const val NOISE = 0.3
    }
}
