#if canImport(CoreMotion) && os(iOS)  // Core Motion sensors are unavailable on macOS, so `swift test` skips this file.
import CoreMotion
import Foundation

/// Raw motion at 50 Hz, fed to the engine's own step counter. It exists for
/// parity with the web demo (same heuristic) and as a fallback where activity
/// recognition is unavailable. Prefer `ActivitySource` on a real iPhone.
public final class AccelerometerSource: MotionSource, @unchecked Sendable {  // CMMotionManager is only touched in start and stop
    public let id = "accelerometer"

    /// Standard gravity; Core Motion reports acceleration in g.
    static let metersPerSecondSquaredPerG = 9.80665

    private let manager = CMMotionManager()
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "kinetic.accelerometer"
        queue.maxConcurrentOperationCount = 1
        return queue
    }()

    public init() {}

    public func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws {
        guard manager.isDeviceMotionAvailable else { throw KineticSourceError.accelerometerUnavailable }
        manager.deviceMotionUpdateInterval = 1.0 / 50.0
        manager.startDeviceMotionUpdates(to: queue) { motion, _ in
            guard let motion else { return }
            // userAcceleration + gravity = what a raw accelerometer would read (in g);
            // the engine wants m/s^2 including gravity, like the Android and web sources.
            let k = Self.metersPerSecondSquaredPerG
            emit(.acceleration(
                t: now(),
                x: (motion.userAcceleration.x + motion.gravity.x) * k,
                y: (motion.userAcceleration.y + motion.gravity.y) * k,
                z: (motion.userAcceleration.z + motion.gravity.z) * k
            ))
        }
    }

    public func stop() {
        manager.stopDeviceMotionUpdates()
    }
}
#endif
