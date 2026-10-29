import Foundation

/// The classes `CMMotionActivity` reports as separate Bools. A plain value so
/// the mapping can be tested without Core Motion.
public struct ActivityFlags: Equatable, Sendable {
    public var stationary = false
    public var walking = false
    public var running = false
    public var automotive = false
    public var cycling = false
    public var unknown = false

    public init(
        stationary: Bool = false, walking: Bool = false, running: Bool = false,
        automotive: Bool = false, cycling: Bool = false, unknown: Bool = false
    ) {
        self.stationary = stationary
        self.walking = walking
        self.running = running
        self.automotive = automotive
        self.cycling = cycling
        self.unknown = unknown
    }
}

/// `CMMotionActivityConfidence` without the framework.
public enum ActivityConfidence: Sendable {
    case low, medium, high
}

public enum ActivityMapping {
    /// Core Motion can set several flags at once (for example walking and automotive
    /// while someone walks on a train). Priority: automotive > cycling > running >
    /// walking > stationary > unknown, so a vehicle never reads as walking.
    public static func kind(for flags: ActivityFlags) -> ActivityKind {
        if flags.automotive { return .automotive }
        if flags.cycling { return .cycling }
        if flags.running { return .running }
        if flags.walking { return .walking }
        if flags.stationary { return .stationary }
        return .unknown
    }

    /// low / medium / high become 0.33 / 0.67 / 1.0 (the TypeScript `ActivitySample` doc
    /// comment). The engine counts an activity as walking from `minActivityConfidence`
    /// (0.5 by default), so a `low` classification is ignored.
    public static func confidence(_ confidence: ActivityConfidence) -> Double {
        switch confidence {
        case .low: 0.33
        case .medium: 0.67
        case .high: 1.0
        }
    }
}
