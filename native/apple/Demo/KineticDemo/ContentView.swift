import KineticUI
import SwiftUI

/// Top bar, optional callout and the form, switched by motion state. The form
/// itself never knows why the state changed.
struct ContentView: View {
    @Environment(MotionStore.self) private var motion
    @Environment(\.motionState) private var motionState
    @Environment(\.kineticMetrics) private var metrics
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            DemoControlsView()
            topBar
            if motion.showFullState.suppressed { suppressedCallout }
            Group {
                switch motionState {
                case .moving: StepperView()
                case .still: FullFormView()
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: motionState)
        }
    }

    private var topBar: some View {
        HStack {
            Text("Kinetic UI")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if motionState == .moving {
                Button("Show full form") { motion.showFull() }
                    .buttonStyle(.bordered)
                    .frame(minHeight: metrics.targetMin)
            } else {
                Text("Full form").foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var suppressedCallout: some View {
        HStack {
            Text("Simplified mode is off for this session.")
            Button("Turn back on") { motion.resetShowFullSession() }
                .buttonStyle(.bordered)
                .frame(minHeight: metrics.targetMin)
        }
        .padding(metrics.gap)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.yellow.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .accessibilityElement(children: .contain)
    }
}

#Preview("Still") {
    let motion = MotionStore(source: SimulatedWalkSource(cadence: 0))
    return ContentView()
        .environment(DemoSources())
        .environment(motion)
        .environment(FormStore(storage: nil))
        .kineticMotion(motion)
}
