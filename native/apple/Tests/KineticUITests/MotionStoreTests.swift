import Foundation
import Testing
@testable import KineticUI

/// A clock the tests move by hand.
final class TestClock: @unchecked Sendable {
    private let ms = Locked<Double>(1_000)
    var now: Now { { [ms] in ms.current } }
    func advance(by delta: Double) { ms.withLock { $0 += delta } }
}

/// Emits one activity sample at start, like the OS classifier does.
final class FakeActivitySource: MotionSource {
    let id = "fake-activity"
    private let activity: ActivityKind
    private let confidence: Double
    init(activity: ActivityKind, confidence: Double = 1.0) {
        self.activity = activity
        self.confidence = confidence
    }
    func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws {
        emit(.activity(t: now(), activity: activity, confidence: confidence))
    }
    func stop() {}
}

final class FailingSource: MotionSource {
    let id = "failing"
    func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws {
        throw KineticSourceError.motionDenied
    }
    func stop() {}
}

/// Waits (briefly) for the main-actor hop that follows a sample pushed by a source.
@MainActor
func eventually(_ condition: @MainActor () -> Bool) async -> Bool {
    for _ in 0..<200 {
        if condition() { return true }
        try? await Task.sleep(for: .milliseconds(5))
    }
    return condition()
}

@MainActor
struct MotionStoreTests {
    @Test func manualSourceSwitchesImmediately() async {
        let manual = ManualSource()
        let store = MotionStore(source: manual)
        await store.start()
        #expect(store.snapshot.state == .still)
        #expect(store.isRunning)

        manual.set(.moving)
        #expect(await eventually { store.snapshot.state == .moving })
        manual.set(.still)
        #expect(await eventually { store.snapshot.state == .still })
        store.stop()
    }

    @Test func activitySamplesNeedTimeBeforeMoving() async {
        let clock = TestClock()
        let store = MotionStore(source: FakeActivitySource(activity: .walking), now: clock.now)
        await store.start()
        // Hysteresis: walking is only pending until enterMovingAfterMs has passed.
        store.tick()
        #expect(store.snapshot.state == .still)
        #expect(store.snapshot.pending == .moving)

        clock.advance(by: store.config.enterMovingAfterMs - 100)
        store.tick()
        #expect(store.snapshot.state == .still)

        clock.advance(by: 200)
        store.tick()
        #expect(store.snapshot.state == .moving)
        #expect(store.snapshot.activity == .walking)
        store.stop()
    }

    @Test func lowConfidenceActivityNeverEntersMoving() async {
        let clock = TestClock()
        let low = ActivityMapping.confidence(.low)
        let store = MotionStore(source: FakeActivitySource(activity: .walking, confidence: low), now: clock.now)
        await store.start()
        clock.advance(by: 60_000)
        store.tick()
        #expect(store.snapshot.state == .still)
        store.stop()
    }

    @Test func showFullForcesStillAndSuppressesAfterThreeTaps() async {
        let manual = ManualSource(initial: .moving)
        let store = MotionStore(source: manual)
        await store.start()
        #expect(await eventually { store.snapshot.state == .moving })

        store.showFull()
        #expect(store.snapshot.state == .still)
        #expect(store.snapshot.detected == .moving)
        #expect(store.showFullState.active)

        store.showFull()
        store.showFull()
        #expect(store.showFullState.suppressed)

        store.resetShowFullSession()
        #expect(!store.showFullState.suppressed)
        #expect(store.snapshot.state == .moving)
        store.stop()
    }

    @Test func forceOverridesDetection() {
        let store = MotionStore()
        store.force(.moving)
        #expect(store.snapshot.state == .moving)
        store.force(nil)
        #expect(store.snapshot.state == .still)
    }

    @Test func startFailureIsExposedNotThrown() async {
        let store = MotionStore(source: FailingSource())
        await store.start()
        #expect(store.errorMessage == KineticSourceError.motionDenied.errorDescription)
        #expect(!store.isRunning)
    }

    @Test func settingASourceWhileRunningRestartsIt() async {
        let first = ManualSource()
        let second = ManualSource(initial: .moving)
        let store = MotionStore(source: first)
        await store.start()
        await store.setSource(second)
        #expect(store.sourceID == "manual")
        #expect(store.isRunning)
        #expect(await eventually { store.snapshot.state == .moving })
        // The replaced source can no longer reach the engine.
        first.set(.still)
        try? await Task.sleep(for: .milliseconds(50))
        #expect(store.snapshot.state == .moving)
        store.stop()
    }

    @Test func simulatedWalkIsDetectedFromRawAcceleration() async {
        var config = defaultConfig()
        config.enterMovingAfterMs = 300
        config.tickIntervalMs = 50
        let walk = SimulatedWalkSource(cadence: 2)
        let store = MotionStore(source: walk, config: config)
        await store.start()
        var reachedMoving = false
        for _ in 0..<100 where !reachedMoving {  // up to ~10 s of real time
            try? await Task.sleep(for: .milliseconds(100))
            reachedMoving = store.snapshot.state == .moving
        }
        #expect(reachedMoving)
        #expect(store.snapshot.cadence > 1.5 && store.snapshot.cadence < 2.5)
        store.stop()
    }

    @Test func staleStartIsIgnored() async {
        let slow = SlowSource()
        let store = MotionStore(source: slow)
        let starting = Task { await store.start() }
        await slow.started.wait()
        await store.setSource(nil)  // overtakes the pending start
        slow.finish()
        await starting.value
        #expect(!store.isRunning)
        #expect(slow.stopCount.current >= 1)
    }
}

/// A source whose start() completes only when told to.
final class SlowSource: MotionSource {
    let id = "slow"
    let stopCount = Locked<Int>(0)
    let started = Signal()
    private let gate = Signal()
    func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws {
        started.fire()
        await gate.wait()
    }
    func finish() { gate.fire() }
    func stop() { stopCount.withLock { $0 += 1 } }
}

/// One-shot async signal.
final class Signal: @unchecked Sendable {
    private let state = Locked<(fired: Bool, waiters: [CheckedContinuation<Void, Never>])>((false, []))
    func fire() {
        let waiters = state.withLock { s -> [CheckedContinuation<Void, Never>] in
            s.fired = true
            defer { s.waiters = [] }
            return s.waiters
        }
        waiters.forEach { $0.resume() }
    }
    func wait() async {
        await withCheckedContinuation { continuation in
            let ready = state.withLock { s -> Bool in
                if !s.fired { s.waiters.append(continuation) }
                return s.fired
            }
            if ready { continuation.resume() }
        }
    }
}
