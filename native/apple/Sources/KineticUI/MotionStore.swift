import Foundation
import Observation

/// Owns a `MotionEngine` (the Rust core), one motion source and the tick loop,
/// and publishes the result for SwiftUI.
///
/// The engine is deterministic and has no clock: this store supplies time
/// (`now`), feeds it samples from the source and calls `tick` every
/// `config.tickIntervalMs` while running. Views read `snapshot`; they never see
/// the source.
@MainActor
@Observable
public final class MotionStore {
    /// Effective state, detector state, force, cadence, pending transition.
    public private(set) var snapshot: MotionSnapshot
    /// "Show full form" policy: taps, whether the force is active, whether moving mode is off.
    public private(set) var showFullState: ShowFullState
    /// `id` of the current source, if any.
    public private(set) var sourceID: String?
    /// True once the source started and the tick loop runs.
    public private(set) var isRunning = false
    /// User-presentable reason the last start failed, if it did.
    public private(set) var errorMessage: String?
    /// The current config. Change it with `configure(_:)`.
    public private(set) var config: MotionConfig

    /// Clock shared by the engine and all sources.
    @ObservationIgnored public let now: Now
    @ObservationIgnored private let engine: MotionEngine
    @ObservationIgnored private let generation = Generation()
    @ObservationIgnored private var source: (any MotionSource)?
    @ObservationIgnored private var wantsRunning = false
    @ObservationIgnored private var tickTask: Task<Void, Never>?
    @ObservationIgnored private var subscription: Subscription?
    @ObservationIgnored private var listener: EngineListener?

    public init(source: (any MotionSource)? = nil, config: MotionConfig = defaultConfig(), now: @escaping Now = systemNow) {
        self.now = now
        self.source = source
        sourceID = source?.id
        self.config = config
        let engine = MotionEngine(config: config, nowMs: now())
        self.engine = engine
        snapshot = engine.snapshot()
        showFullState = engine.showFullState()

        let listener = EngineListener { [weak self] in
            // The engine calls this on whatever thread pushed a sample.
            Task { @MainActor in self?.refresh() }
        }
        self.listener = listener
        subscription = engine.subscribe(listener: listener)
    }

    // MARK: Lifecycle

    /// Starts the source and the tick loop. A failure does not throw: it sets `errorMessage`.
    public func start() async {
        guard !wantsRunning else { return }
        wantsRunning = true
        await launch()
    }

    public func stop() {
        wantsRunning = false
        halt()
    }

    /// Swaps the source; restarts automatically if the store is running. Resets detector and hysteresis.
    public func setSource(_ newSource: (any MotionSource)?) async {
        halt()
        source = newSource
        sourceID = newSource?.id
        errorMessage = nil
        refresh()
        if wantsRunning, newSource != nil { await launch() }
    }

    // MARK: Engine controls

    /// Overrides the detected state (`nil` removes the override).
    public func force(_ state: MotionState?) {
        engine.force(state: state, nowMs: now())
        refresh()
    }

    /// The user tapped "Show full form".
    public func showFull() {
        engine.showFull(nowMs: now())
        refresh()
    }

    /// Starts a new Show-full session (taps and suppression cleared).
    public func resetShowFullSession() {
        engine.resetShowFullSession(nowMs: now())
        refresh()
    }

    /// Replaces the config and re-evaluates. The tick interval applies on the next start.
    public func configure(_ newConfig: MotionConfig) {
        engine.configure(config: newConfig, nowMs: now())
        refresh()
    }

    /// Re-evaluates time-based transitions. The loop calls this; it is also public
    /// for tests and for hosts that drive their own timer.
    public func tick() {
        engine.tick(nowMs: now())
        refresh()
    }

    // MARK: Internals

    private func refresh() {
        let newSnapshot = engine.snapshot()
        if newSnapshot != snapshot { snapshot = newSnapshot }
        let newShowFull = engine.showFullState()
        if newShowFull != showFullState { showFullState = newShowFull }
        let newConfig = engine.config()
        if newConfig != config { config = newConfig }
    }

    private func halt() {
        generation.advance()
        tickTask?.cancel()
        tickTask = nil
        source?.stop()
        isRunning = false
        engine.reset(nowMs: now())
        refresh()
    }

    private func launch() async {
        guard let current = source else {
            refresh()
            return
        }
        let mine = generation.advance()
        errorMessage = nil
        let engine = engine
        let generation = generation
        do {
            try await current.start(now: now) { sample in
                // Samples from a replaced or stopped start are dropped.
                if generation.current == mine { engine.pushSample(sample: sample) }
            }
        } catch {
            guard generation.current == mine else { return }
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            wantsRunning = false
            isRunning = false
            refresh()
            return
        }
        guard generation.current == mine else {
            current.stop()  // a newer start or a stop() overtook this one
            return
        }
        isRunning = true
        startTicking()
        refresh()
    }

    private func startTicking() {
        tickTask?.cancel()
        let interval = max(config.tickIntervalMs, 10)
        tickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(interval))
                // The loop holds the store weakly, so it also ends when the store goes away.
                guard !Task.isCancelled, let self else { break }
                self.tick()
            }
        }
    }
}

/// Bumped on every start, stop and source change. A late `start()` result or a
/// late sample compares its number with the current one and is ignored if stale
/// (the TypeScript store's `generation`). Lock-protected because samples arrive
/// on source threads.
final class Generation: Sendable {
    private let value = Locked<Int>(0)
    @discardableResult
    func advance() -> Int { value.withLock { $0 += 1; return $0 } }
    var current: Int { value.current }
}

/// Adapts a closure to the generated `ChangeListener` protocol.
final class EngineListener: ChangeListener, @unchecked Sendable {
    private let handler: @Sendable () -> Void
    init(_ handler: @escaping @Sendable () -> Void) { self.handler = handler }
    func onChange() { handler() }
}
