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
            var signal = WalkSignal()
            while !Task.isCancelled {
                let cadence = state.withLock { $0.cadence }
                emit(signal.sample(at: now(), cadence: cadence))
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

/// The waveform as a function of the sample timestamp, not of the loop count: when
/// `Task.sleep` overruns on a busy device the sample rate drops but the frequency
/// stays right (advancing a fixed step per iteration would stretch the wave and the
/// estimator would read a lower cadence). The phase accumulates, so changing the
/// cadence mid-walk does not jump.
struct WalkSignal {
    private var noise = SplitMix64(seed: 1)
    private var phase = 0.0
    private var lastT: Double?

    mutating func sample(at t: Double, cadence: Double) -> Sample {
        if let lastT { phase += 2 * Double.pi * cadence * (t - lastT) / 1000 }
        lastT = t
        let swing = cadence > 0 ? 3 * sin(phase) : 0
        return .acceleration(
            t: t,
            x: noise.nextCentered() * 0.3,
            y: noise.nextCentered() * 0.3,
            z: 9.81 + swing + noise.nextCentered() * 0.3
        )
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
