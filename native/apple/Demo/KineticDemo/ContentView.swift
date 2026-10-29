import KineticUI
import SwiftUI

/// Header, demo controls, mode bar and the form, switched by motion state. The form
/// itself never knows why the state changed.
struct ContentView: View {
    @Environment(MotionStore.self) private var motion
    @Environment(DebugUI.self) private var debugUI
    @Environment(\.motionState) private var motionState
    @Environment(\.kineticMetrics) private var metrics
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Local mirror of `debugUI.isOpen` for `.sheet` (see the note about Binding(get:set:) at the top of FieldView.swift).
    @State private var sheetOpen = false

    private static let repoURL = URL(string: "https://github.com/kkauper/kinetic-ui")!

    var body: some View {
        VStack(spacing: 0) {
            header
            DemoControlsView()
            modeBar
            if motion.showFullState.suppressed { suppressedNotice }
            Group {
                switch motionState {
                case .moving: StepperView()
                case .still: FullFormView()
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: motionState)
        }
        .background(KColor.background.ignoresSafeArea())
        .sheet(isPresented: $sheetOpen) {
            DebugSheet()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(KColor.background)
        }
        .onChange(of: debugUI.isOpen, initial: true) { _, open in
            if sheetOpen != open { sheetOpen = open }
        }
        .onChange(of: sheetOpen) { _, open in
            if debugUI.isOpen != open { debugUI.isOpen = open }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                LogoMark(size: 28)
                HStack(spacing: 0) {
                    Text("Kinetic").foregroundStyle(KColor.text)
                    Text(" UI").foregroundStyle(KColor.secondary)
                }
                .font(KineticFont.custom(20, .bold, relativeTo: .title3))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Kinetic UI")
            .accessibilityAddTraits(.isHeader)
            Spacer()
            Link(destination: Self.repoURL) {
                Text("GitHub")
                    .font(KineticFont.custom(15, .medium, relativeTo: .subheadline))
                    .foregroundStyle(KColor.text)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(KColor.surface))
                    .overlay(Capsule().strokeBorder(KColor.border, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .accessibilityLabel("Kinetic UI on GitHub")
            .accessibilityHint("Opens in your browser")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    /// Same place in both modes: the label in still mode becomes the escape hatch in moving mode.
    private var modeBar: some View {
        HStack {
            if motionState == .moving {
                Text("Simplified")
                    .font(KineticFont.secondary)
                    .foregroundStyle(KColor.secondary)
                Spacer()
                Button("Show full form") { motion.showFull() }
                    .buttonStyle(.pill(.soft))
            } else {
                Text("Full form")
                    .font(KineticFont.secondary)
                    .foregroundStyle(KColor.secondary)
                Spacer()
            }
        }
        .frame(minHeight: metrics.targetMin)
        .padding(.horizontal, 16)
    }

    private var suppressedNotice: some View {
        NoticeCard(
            kind: .info,
            title: "Simplified mode is off for this session",
            actionTitle: "Turn back on",
            action: { motion.resetShowFullSession() }
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }
}

#Preview("Still") {
    let motion = MotionStore(source: SimulatedWalkSource(cadence: 0))
    return ContentView()
        .environment(DemoSources())
        .environment(DebugUI())
        .environment(motion)
        .environment(FormStore(storage: nil))
        .kineticMotion(motion)
        .preferredColorScheme(.dark)
}
