package co.kauper.kineticui

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
 * at [cadence] steps per second and a little noise (the same signal as the TypeScript simulator, see [WalkSignal]).
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
            val signal = WalkSignal(cadence)
            val newScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            scope = newScope
            job = newScope.launch {
                val periodMs = 1000L / sampleRateHz
                while (isActive) {
                    signal.cadence = cadence
                    emit(signal.sampleAt(now.ms()))
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
}
