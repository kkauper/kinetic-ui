#if canImport(CoreMotion) && os(iOS)  // Core Motion sensors are unavailable on macOS, so `swift test` skips this file.
import CoreMotion
import Foundation

/// The OS activity classifier (`CMMotionActivityManager`): the iPhone's motion
/// coprocessor already decides "walking", so this is the most battery-friendly
/// and most accurate source. Needs the Motion & Fitness permission
/// (`NSMotionUsageDescription`) and a real device.
public final class ActivitySource: MotionSource, @unchecked Sendable {  // CMMotionActivityManager is safe to start and stop from any thread
    public let id = "activity"

    private let manager = CMMotionActivityManager()
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "kinetic.activity"
        queue.maxConcurrentOperationCount = 1
        return queue
    }()

    public init() {}

    public func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws {
        guard CMMotionActivityManager.isActivityAvailable() else { throw KineticSourceError.activityUnavailable }
        try Self.checkAuthorization()

        // The permission prompt appears on first use. A short history query makes it
        // appear (and wait for the answer) before we start, so a denial becomes an
        // error here instead of silence.
        if CMMotionActivityManager.authorizationStatus() == .notDetermined {
            await requestAuthorization()
            try Self.checkAuthorization()
        }

        manager.startActivityUpdates(to: queue) { activity in
            guard let activity else { return }
            emit(.activity(
                t: now(),
                activity: ActivityMapping.kind(for: Self.flags(of: activity)),
                confidence: ActivityMapping.confidence(Self.confidence(of: activity))
            ))
        }
    }

    public func stop() {
        manager.stopActivityUpdates()
    }

    private static func checkAuthorization() throws {
        switch CMMotionActivityManager.authorizationStatus() {
        case .denied: throw KineticSourceError.motionDenied
        case .restricted: throw KineticSourceError.motionRestricted
        default: break
        }
    }

    private func requestAuthorization() async {
        let end = Date()
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            manager.queryActivityStarting(from: end.addingTimeInterval(-60), to: end, to: queue) { _, _ in
                continuation.resume()
            }
        }
    }

    private static func flags(of activity: CMMotionActivity) -> ActivityFlags {
        ActivityFlags(
            stationary: activity.stationary, walking: activity.walking, running: activity.running,
            automotive: activity.automotive, cycling: activity.cycling, unknown: activity.unknown
        )
    }

    private static func confidence(of activity: CMMotionActivity) -> ActivityConfidence {
        switch activity.confidence {
        case .low: .low
        case .medium: .medium
        case .high: .high
        @unknown default: .low
        }
    }
}
#endif
