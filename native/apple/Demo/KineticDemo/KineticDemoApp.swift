import KineticUI
import SwiftUI

/// Creates the stores once and injects them. Views read `motionState` and
/// `kineticMetrics` from the environment (set by `.kineticMotion`); only
/// `DemoControlsView` and `DebugSheet` know about motion sources.
@main
struct KineticDemoApp: App {
    @State private var sources: DemoSources
    @State private var motion: MotionStore
    @State private var form: FormStore
    @State private var debugUI: DebugUI

    init() {
        let sources = DemoSources()
        _sources = State(initialValue: sources)
        // The manual source needs no permission, so the demo can start with it.
        _motion = State(initialValue: MotionStore(source: sources.manual))
        _form = State(initialValue: FormStore())
        _debugUI = State(initialValue: DebugUI())
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(sources)
                .environment(motion)
                .environment(form)
                .environment(debugUI)
                .kineticMotion(motion)
                // Dark only, like the web demo; Hanken Grotesk is the default font for all text.
                .preferredColorScheme(.dark)
                .tint(KColor.accent)
                .font(KineticFont.body)
                .task { await motion.start() }
        }
    }
}
