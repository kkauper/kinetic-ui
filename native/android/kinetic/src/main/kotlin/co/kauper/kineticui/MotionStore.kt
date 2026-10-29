package co.kauper.kineticui

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import uniffi.kinetic.ChangeListener
import uniffi.kinetic.MotionConfig
import uniffi.kinetic.MotionEngine
import uniffi.kinetic.MotionSnapshot
import uniffi.kinetic.MotionState
import uniffi.kinetic.ShowFullState
import uniffi.kinetic.Subscription
import uniffi.kinetic.defaultConfig

/**
 * Owns a Rust [MotionEngine], connects one [MotionSource] to it, ticks it on a timer and exposes the
 * result as [StateFlow]s for the UI.
 *
 * The engine is deterministic and has no clock or thread of its own; this class is the platform half:
 * it feeds samples, calls `tick` every `config.tickIntervalMs` while running and mirrors the engine
 * into flows. Every flow update happens under one lock, so a stale snapshot never overwrites a newer one.
 *
 * Failures to start a source never throw out of [start] or [setSource]; they land in [error] and
 * the call returns `false`.
 *
 * @param scope runs the tick timer. Use `MainScope()` (the default) in an app, a test scope in tests.
 * @param now the clock shared with the sources; inject a fake one in tests.
 */
class MotionStore(
    source: MotionSource? = null,
    config: MotionConfig = defaultConfig(),
    private val scope: CoroutineScope = MainScope(),
    private val now: Now = SystemNow,
) : AutoCloseable {
    private val engine = MotionEngine(config, now.ms())
    private val lock = Any()

    private val _snapshot = MutableStateFlow(engine.snapshot())
    private val _showFull = MutableStateFlow(engine.showFullState())
    private val _sourceId = MutableStateFlow(source?.id)
    private val _running = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)

    /** The effective state and everything the debug readout shows. */
    val snapshot: StateFlow<MotionSnapshot> = _snapshot.asStateFlow()

    /** State of the "Show full form" escape hatch. */
    val showFullState: StateFlow<ShowFullState> = _showFull.asStateFlow()

    /** Id of the current source, or null. */
    val sourceId: StateFlow<String?> = _sourceId.asStateFlow()

    /** True while the source is delivering samples and the timer runs. */
    val running: StateFlow<Boolean> = _running.asStateFlow()

    /** User-facing reason the source could not start, or null. */
    val error: StateFlow<String?> = _error.asStateFlow()

    /** The current engine config. */
    val config: MotionConfig get() = engine.config()

    private var source: MotionSource? = source
    private var active = false
    private var ticker: Job? = null

    /** Bumped on stop/setSource/start so samples and start results from an older run are ignored. */
    @Volatile
    private var generation = 0

    private val subscription: Subscription = engine.subscribe(
        object : ChangeListener {
            override fun onChange() = refresh()
        },
    )

    private fun refresh() {
        synchronized(lock) {
            _snapshot.value = engine.snapshot()
            _showFull.value = engine.showFullState()
        }
    }

    /** Starts the source and the tick timer. Returns false (and sets [error]) if the source cannot start. */
    suspend fun start(): Boolean {
        val run: Run
        synchronized(lock) {
            if (active) return _running.value
            active = true
            run = beginRun()
        }
        return launch(run)
    }

    /** Stops the source and the timer, and resets detection (the UI returns to `still`). */
    fun stop() {
        val old: MotionSource?
        synchronized(lock) {
            active = false
            old = halt()
        }
        old?.stop()
        engine.reset(now.ms())
        refresh()
    }

    /** Swaps the source, restarting automatically if the store is running. Resets detection. */
    suspend fun setSource(next: MotionSource?): Boolean {
        val old: MotionSource?
        val run: Run?
        synchronized(lock) {
            old = halt()
            source = next
            _sourceId.value = next?.id
            _error.value = null
            run = if (active && next != null) beginRun() else null
        }
        old?.stop()
        engine.reset(now.ms())
        refresh()
        return if (run != null) launch(run) else false
    }

    /** Overrides the detected state; `null` removes the override. */
    fun force(state: MotionState?) = engine.force(state, now.ms())

    /** The user tapped "Show full form". */
    fun showFull() = engine.showFull(now.ms())

    /** Starts a new Show-full session ("Turn back on"). */
    fun resetShowFullSession() = engine.resetShowFullSession(now.ms())

    /** Replaces the config with `update(current)` and re-evaluates. The tick interval applies on the next start. */
    fun configure(update: (MotionConfig) -> MotionConfig) {
        engine.configure(update(engine.config()), now.ms())
    }

    /** Stops everything and releases the engine. The store must not be used afterwards. */
    override fun close() {
        stop()
        subscription.cancel()
        subscription.close()
        engine.close()
    }

    private class Run(val generation: Int, val source: MotionSource?)

    /** Called under [lock]. */
    private fun beginRun(): Run {
        generation++
        _error.value = null
        return Run(generation, source)
    }

    /** Called under [lock]. Returns the source to stop, which must happen after the lock is released. */
    private fun halt(): MotionSource? {
        generation++
        ticker?.cancel()
        ticker = null
        _running.value = false
        return source
    }

    private suspend fun launch(run: Run): Boolean {
        val current = run.source ?: return false
        try {
            current.start(now) { sample ->
                if (run.generation == generation) engine.pushSample(sample)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            synchronized(lock) {
                if (run.generation != generation) return false
                _error.value = e.message ?: "The motion source could not start."
                active = false
                _running.value = false
            }
            current.stop()
            return false
        }
        val stale: Boolean
        synchronized(lock) {
            stale = run.generation != generation
            if (!stale) {
                _running.value = true
                ticker = scope.launch {
                    val periodMs = config.tickIntervalMs.toLong().coerceAtLeast(1L)
                    while (isActive) {
                        delay(periodMs)
                        engine.tick(now.ms())
                    }
                }
            }
        }
        if (stale) {
            current.stop()
            return false
        }
        return true
    }
}
