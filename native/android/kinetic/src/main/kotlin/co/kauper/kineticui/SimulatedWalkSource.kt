package co.kauper.kineticui

import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import uniffi.kinetic.Sample

/**
 * Synthetic walking for an emulator: a 50 Hz acceleration signal with gravity on z, a sine swing
 * at [cadence] steps per second and a little noise (the same signal as the TypeScript simulator).
 * It exercises the real step detector, so the hysteresis can be tuned without a phone.
 */
class SimulatedWalkSource(
    cadence: Double = 1.8,
    private val sampleRateHz: Int = 50,
) : MotionSource {
    override val id: String = "simulated-steps"

    /** Steps per second; 0 produces a still phone. Takes effect on the next sample. */
    @Volatile
    var cadence: Double = cadence

    private val lock = Any()
    private var scope: CoroutineScope? = null
    private var job: Job? = null

    override suspend fun start(now: Now, emit: (Sample) -> Unit) {
        synchronized(lock) {
            if (job != null) return
            val random = Random(1)
            var phase = 0.0
            val newScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            scope = newScope
            job = newScope.launch {
                val periodMs = 1000L / sampleRateHz
                while (isActive) {
                    phase += 2 * PI * cadence / sampleRateHz
                    val swing = if (cadence > 0) SWING * sin(phase) else 0.0
                    emit(
                        Sample.Acceleration(
                            t = now.ms(),
                            x = (random.nextDouble() - 0.5) * NOISE,
                            y = (random.nextDouble() - 0.5) * NOISE,
                            z = GRAVITY + swing + (random.nextDouble() - 0.5) * NOISE,
                        ),
                    )
                    delay(periodMs)
                }
            }
        }
    }

    override fun stop() {
        synchronized(lock) {
            scope?.cancel()
            scope = null
            job = null
        }
    }

    private companion object {
        const val GRAVITY = 9.81
        const val SWING = 3.0
        const val NOISE = 0.3
    }
}
