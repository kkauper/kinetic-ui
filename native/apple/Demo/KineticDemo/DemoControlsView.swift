import KineticUI
import SwiftUI

/// Stands in for input devices (a switch, the phone's motion sensors). It is
/// tooling, not product UI: small fixed sizes, and the only place (with the debug
/// sheet) that touches motion sources. Pill tags, as on the web.
struct DemoControlsView: View {
    @Environment(MotionStore.self) private var motion
    @Environment(DemoSources.self) private var sources
    @Environment(DebugUI.self) private var debugUI
    /// A dismissed notice stays dismissed until the error text changes or clears.
    @State private var dismissedError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            tags
            status
            if let message = motion.errorMessage, message != dismissedError {
                let notice = noticeForError(message)
                NoticeCard(
                    kind: .error,
                    title: notice.title,
                    message: notice.body,
                    actionTitle: notice.offerSimulate ? "Use Simulate walking instead" : nil,
                    action: { setManual(true) },
                    onDismiss: { dismissedError = message }
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Demo controls")
        .onChange(of: motion.errorMessage) { _, message in
            if message == nil { dismissedError = nil }
        }
    }

    // MARK: Pieces

    private var tags: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                TagButton(title: "Simulate walking", pressed: manualWalking) { setManual(!manualWalking) }
                TagButton(title: activityActive ? "Walking mode on" : "Walking mode", pressed: activityActive, action: toggleActivity)
                    .accessibilityHint("Uses your phone's motion sensor to detect walking.")
                TagButton(title: "Debug", pressed: nil) { debugUI.isOpen = true }
                    .accessibilityHint("Opens the debug sheet")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var status: some View {
        if activityActive || (motion.sourceID == sources.accelerometer.id && motion.isRunning) {
            Text("Walking mode on: \(motion.snapshot.detected == .moving ? "moving" : "still"). Switches after about 5 s.")
                .font(KineticFont.caption)
                .foregroundStyle(KColor.secondary)
                .padding(.horizontal, 16)
        }
    }

    // MARK: Derived state

    private var manualActive: Bool { motion.sourceID == sources.manual.id }
    private var activityActive: Bool { motion.sourceID == sources.activity.id && motion.isRunning }
    private var manualWalking: Bool { manualActive && motion.snapshot.detected == .moving }

    // MARK: Actions

    private func setManual(_ on: Bool) {
        sources.manual.set(on ? .moving : .still)
        if !manualActive { Task { await sources.use(sources.manual, in: motion) } }
    }

    private func toggleActivity() {
        if activityActive {
            sources.manual.set(.still)
            Task { await sources.use(sources.manual, in: motion) }
        } else {
            Task { await sources.use(sources.activity, in: motion) }
        }
    }
}
