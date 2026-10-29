import Foundation

/// Synthetic walking for the Simulator and previews: 50 Hz acceleration
/// samples, gravity on z plus a sine at the chosen cadence and a little noise
/// (the TypeScript `createSimulatorSource`). Cadence 0 is a phone lying still.
public final class SimulatedWalkSource: MotionSource {
    public let id = "simulator"

    private struct Config {
        var cadence: Double
        var task: Task<Void, Never>?
    }

    private let state: Locked<Config>
    private let sampleRateHz: Double

    public init(cadence: Double = 0, sampleRateHz: Double = 50) {
        state = Locked(Config(cadence: cadence))
        self.sampleRateHz = sampleRateHz
    }

    /// Steps per second; takes effect on the next sample.
    public var cadence: Double {
        get { state.withLock { $0.cadence } }
        set { state.withLock { $0.cadence = newValue } }
    }

    public func start(now: @escaping Now, emit: @escaping @Sendable (Sample) -> Void) async throws {
        stop()
        let rate = sampleRateHz
        let state = state
        let task = Task.detached {
            var generator = SplitMix64(seed: 1)
            var phase = 0.0
            while !Task.isCancelled {
                let cadence = state.withLock { $0.cadence }
                phase += 2 * Double.pi * cadence / rate
                let swing = cadence > 0 ? 3 * sin(phase) : 0
                emit(.acceleration(
                    t: now(),
                    x: generator.nextCentered() * 0.3,
                    y: generator.nextCentered() * 0.3,
                    z: 9.81 + swing + generator.nextCentered() * 0.3
                ))
                try? await Task.sleep(for: .milliseconds(1000 / rate))
            }
        }
        state.withLock { $0.task = task }
    }

    public func stop() {
        let task = state.withLock { config -> Task<Void, Never>? in
            defer { config.task = nil }
            return config.task
        }
        task?.cancel()
    }
}

/// Small deterministic generator, so the simulated noise is reproducible.
struct SplitMix64 {
    private var state: UInt64
    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Uniform in -0.5..<0.5.
    mutating func nextCentered() -> Double {
        Double(next() >> 11) / Double(1 << 53) - 0.5
    }
}
