import Foundation

/// A switch, not a sensor: emits explicit `.state` samples, which bypass hysteresis.
/// Needs no permission, so the demo starts with it.
public final class ManualSource: MotionSource {
    public let id = "manual"

    private struct Running {
        var now: Now
        var emit: @Sendable (Sample) -> Void
    }

    private let state: Locked<MotionState>
    private let running = Locked<Running?>(nil)

    public init(initial: MotionState = .still) {
        state = Locked(initial)
    }

    public var current: MotionState { state.current }

    /// Sets the state; if the source is started, emits it immediately.
    public func set(_ newState: MotionState) {
        state.withLock { $0 = newState }
        if let r = running.current {
            r.emit(.state(t: r.now(), state: newState))
        }
    }

    public func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws {
        running.withLock { $0 = Running(now: now, emit: emit) }
        emit(.state(t: now(), state: state.current))
    }

    public func stop() {
        running.withLock { $0 = nil }
    }
}
