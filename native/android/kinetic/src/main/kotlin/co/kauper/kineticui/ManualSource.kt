package co.kauper.kineticui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.kinetic.MotionState
import uniffi.kinetic.Sample

/**
 * A switch that reports `still` or `moving` directly (explicit state samples bypass the engine's
 * hysteresis). Stands in for a sensor on an emulator or a desk.
 */
class ManualSource(initial: MotionState = MotionState.STILL) : MotionSource {
    override val id: String = "manual"

    private val lock = Any()
    private var emit: ((Sample) -> Unit)? = null
    private var now: Now = SystemNow

    private val _state = MutableStateFlow(initial)

    /** The state the switch is in, whether or not the source is running. */
    val state: StateFlow<MotionState> = _state.asStateFlow()

    /** Sets the state and, if the source is running, reports it immediately. */
    fun set(state: MotionState) {
        val target: ((Sample) -> Unit)?
        val clock: Now
        synchronized(lock) {
            _state.value = state
            target = emit
            clock = now
        }
        target?.invoke(Sample.State(clock.ms(), state))
    }

    override suspend fun start(now: Now, emit: (Sample) -> Unit) {
        synchronized(lock) {
            this.now = now
            this.emit = emit
        }
        emit(Sample.State(now.ms(), _state.value))
    }

    override fun stop() {
        synchronized(lock) { emit = null }
    }
}
