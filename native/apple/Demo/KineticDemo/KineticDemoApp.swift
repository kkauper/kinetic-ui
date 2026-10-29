import KineticUI
import SwiftUI

/// Creates the stores once and injects them. Views read `motionState` and
/// `kineticMetrics` from the environment (set by `.kineticMotion`); only
/// `DemoControlsView` knows about motion sources.
@main
struct KineticDemoApp: App {
    @State private var sources: DemoSources
    @State private var motion: MotionStore
    @State private var form: FormStore

    init() {
        let sources = DemoSources()
        _sources = State(initialValue: sources)
        // The manual source needs no permission, so the demo can start with it.
        _motion = State(initialValue: MotionStore(source: sources.manual))
        _form = State(initialValue: FormStore())
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(sources)
                .environment(motion)
                .environment(form)
                .kineticMotion(motion)
                .task { await motion.start() }
        }
    }
}
