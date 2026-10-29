import KineticUI
import Observation

/// The input devices the demo can switch between. Tooling, not product code.
@MainActor
@Observable
final class DemoSources {
    let manual = ManualSource()
    let activity = ActivitySource()
    let accelerometer = AccelerometerSource()
    let simulated = SimulatedWalkSource(cadence: 1.8)
}
