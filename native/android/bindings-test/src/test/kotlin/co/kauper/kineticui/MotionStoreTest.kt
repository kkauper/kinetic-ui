package co.kauper.kineticui

import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uniffi.kinetic.ActivityKind
import uniffi.kinetic.MotionState
import uniffi.kinetic.Sample
import uniffi.kinetic.defaultConfig

/** MotionStore and the platform-neutral sources, against the real Rust engine. */
class MotionStoreTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val stores = mutableListOf<MotionStore>()

    /** Short timings so the tests are quick: tick every 10 ms, walking needs 150 ms. */
    private val fastConfig = defaultConfig().copy(tickIntervalMs = 10.0, enterMovingAfterMs = 150.0, exitMovingAfterMs = 150.0)

    private fun store(source: MotionSource?): MotionStore =
        MotionStore(source = source, config = fastConfig, scope = scope).also { stores += it }

    @AfterEach
    fun tearDown() {
        stores.forEach { it.close() }
        scope.cancel()
    }

    @Test
    fun `manual source drives the state immediately`() = runBlocking {
        val manual = ManualSource()
        val store = store(manual)
        assertTrue(store.start())
        assertTrue(store.running.value)
        assertEquals("manual", store.sourceId.value)

        manual.set(MotionState.MOVING)
        assertEquals(MotionState.MOVING, store.snapshot.value.state)
        manual.set(MotionState.STILL)
        assertEquals(MotionState.STILL, store.snapshot.value.state)
    }

    @Test
    fun `an activity source enters moving only after the tick timer has run`() = runBlocking {
        val source = object : MotionSource {
            override val id = "fake-activity"
            override suspend fun start(now: Now, emit: (Sample) -> Unit) {
                emit(Sample.Activity(now.ms(), ActivityKind.WALKING, 1.0))
            }
            override fun stop() = Unit
        }
        val store = store(source)
        store.start()
        assertEquals(MotionState.STILL, store.snapshot.value.state)
        withTimeout(5_000) { store.snapshot.first { it.state == MotionState.MOVING } }
        assertEquals(ActivityKind.WALKING, store.snapshot.value.activity)
    }

    @Test
    fun `simulated steps eventually read as walking`() = runBlocking {
        val store = store(SimulatedWalkSource(cadence = 1.8))
        store.start()
        // Real step detection: needs a few seconds of signal plus the (shortened) hysteresis.
        withTimeout(15_000) { store.snapshot.first { it.state == MotionState.MOVING } }
        assertTrue(store.snapshot.value.cadence > 0.0)
    }

    @Test
    fun `a source that cannot start reports its message and leaves the store stopped`() = runBlocking {
        val failing = object : MotionSource {
            override val id = "failing"
            override suspend fun start(now: Now, emit: (Sample) -> Unit) {
                throw KineticSourceException("Permission needed")
            }
            override fun stop() = Unit
        }
        val store = store(failing)
        assertFalse(store.start())
        assertEquals("Permission needed", store.error.value)
        assertFalse(store.running.value)
        // Choosing another source clears the error.
        store.setSource(ManualSource())
        assertNull(store.error.value)
    }

    @Test
    fun `a slow start that is superseded is ignored and stopped`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val entered = CompletableDeferred<Unit>()
        val stopped = AtomicBoolean(false)
        val slow = object : MotionSource {
            override val id = "slow"
            override suspend fun start(now: Now, emit: (Sample) -> Unit) {
                entered.complete(Unit)
                gate.await()
                emit(Sample.State(now.ms(), MotionState.MOVING)) // must be dropped: generation moved on
            }
            override fun stop() {
                stopped.set(true)
            }
        }
        val store = store(slow)
        val slowStart = scope.async { store.start() }
        entered.await()
        // Replace the source while the first start is still pending.
        val manual = ManualSource()
        assertTrue(store.setSource(manual))
        gate.complete(Unit)
        assertFalse(slowStart.await())
        assertEquals("manual", store.sourceId.value)
        assertEquals(MotionState.STILL, store.snapshot.value.state)
        assertTrue(stopped.get())
        assertTrue(store.running.value)
    }

    @Test
    fun `stop resets to still and show full state is mirrored`() = runBlocking {
        val manual = ManualSource()
        val store = store(manual)
        store.start()
        manual.set(MotionState.MOVING)
        store.showFull()
        assertEquals(MotionState.STILL, store.snapshot.value.state)
        assertTrue(store.showFullState.value.active)
        assertEquals(1u, store.showFullState.value.taps)

        store.stop()
        assertFalse(store.running.value)
        assertEquals(MotionState.STILL, store.snapshot.value.detected)
        store.resetShowFullSession()
        assertEquals(0u, store.showFullState.value.taps)
        assertNotNull(store.config)
    }

    @Test
    fun `force overrides the detected state`() = runBlocking {
        val store = store(null)
        store.force(MotionState.MOVING)
        assertEquals(MotionState.MOVING, store.snapshot.value.state)
        assertEquals(MotionState.MOVING, store.snapshot.value.forced)
        store.force(null)
        assertEquals(MotionState.STILL, store.snapshot.value.state)
    }
}

/** The synthetic walk waveform, without coroutines or real time. */
class WalkSignalTest {
    @Test
    fun `late jittered samples keep the frequency, so the detector still reads 2 steps per second`() {
        val engine = uniffi.kinetic.MotionEngine(defaultConfig(), 0.0)
        val signal = WalkSignal(cadence = 2.0)
        val jitter = kotlin.random.Random(7)
        var t = 0.0
        while (t < 15_000.0) {
            engine.pushSample(signal.sampleAt(t))
            engine.tick(t)
            t += 35 + jitter.nextInt(41) // 35..75 ms instead of the nominal 20 ms
        }
        val snapshot = engine.snapshot()
        assertEquals(MotionState.MOVING, snapshot.state)
        assertTrue(snapshot.cadence in 1.8..2.2, "cadence was ${snapshot.cadence}")
    }

    @Test
    fun `phase stays continuous when the cadence changes`() {
        val signal = WalkSignal(cadence = 1.0)
        signal.sampleAt(0.0)
        signal.sampleAt(500.0)
        val before = signal.currentPhase
        signal.cadence = 3.0
        signal.sampleAt(600.0)
        // Only the 100 ms since the last sample are at the new cadence: no jump, no reset.
        assertEquals(before + 2 * Math.PI * 3.0 * 0.1, signal.currentPhase, 1e-9)
    }
}
