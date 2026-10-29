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

    /// Switches `motion` to `source` and starts it. Failures show up in `motion.errorMessage`.
    func use(_ source: any MotionSource, in motion: MotionStore) async {
        await motion.setSource(source)
        await motion.start()
    }
}

/// Whether the debug sheet is open. Shared so the pinned status pill (in the form layouts) and the
/// "Debug" tag open the same sheet, which is presented once, from `ContentView`.
@MainActor
@Observable
final class DebugUI {
    var isOpen = false

    /// `UserDefaults` key of "Keep readout on screen" (read with `@AppStorage`).
    nonisolated static let pinnedKey = "kinetic-ui:debug-pinned"
}
