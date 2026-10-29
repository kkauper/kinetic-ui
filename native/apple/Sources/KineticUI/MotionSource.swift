import Foundation

/// An input device for the motion engine: it turns hardware (or a switch) into `Sample`s.
///
/// Components never touch a source; they read `motionState` from the
/// environment. Only the app shell (or the demo controls) picks a source.
public protocol MotionSource: AnyObject, Sendable {
    /// Stable identifier, shown in the debug readout.
    var id: String { get }

    /// Starts delivering samples to `emit`, stamped with `now()`. `emit` may be
    /// called from any thread. Throws a user-presentable error when the source
    /// cannot run (unavailable, permission denied).
    func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws

    /// Stops delivering. Safe to call when not started.
    func stop()
}

/// Why a source could not start. `errorDescription` is meant to be shown to the user.
public enum KineticSourceError: Error, LocalizedError, Equatable, Sendable {
    case activityUnavailable
    case motionDenied
    case motionRestricted
    case accelerometerUnavailable

    public var errorDescription: String? {
        switch self {
        case .activityUnavailable:
            "This device does not provide motion activity data (the Simulator never does). Use the accelerometer or the simulated walk instead."
        case .motionDenied:
            "Motion & Fitness access is turned off for this app. Enable it in Settings > Privacy & Security > Motion & Fitness."
        case .motionRestricted:
            "Motion & Fitness access is restricted on this device, for example by Screen Time or a management profile."
        case .accelerometerUnavailable:
            "This device has no accelerometer data available."
        }
    }
}
