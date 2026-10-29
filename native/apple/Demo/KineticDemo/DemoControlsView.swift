import KineticUI
import SwiftUI

/// Stands in for input devices (a switch, the phone's motion sensors). It is
/// tooling, not product UI: small fixed sizes, and the only place that touches
/// motion sources.
struct DemoControlsView: View {
    @Environment(MotionStore.self) private var motion
    @Environment(DemoSources.self) private var sources
    @AppStorage("kinetic-ui:debug") private var debug = false
    @State private var cadence = 1.8
    @State private var manualOn = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Toggle("Simulate walking", isOn: $manualOn)
                    .toggleStyle(.switch)
                    .fixedSize()
                    // No Binding(get:set:): see the note at the top of FieldView.swift.
                    .onChange(of: manualWalking, initial: true) { _, walking in
                        if manualOn != walking { manualOn = walking }
                    }
                    .onChange(of: manualOn) { _, on in
                        if on != manualWalking { setManual(on) }
                    }
                Spacer()
            }
            HStack {
                Button(activityActive ? "Stop walking mode" : "Walking mode", action: toggleActivity)
                Button("Simulated steps") { Task { await use(sources.simulated) } }
                    .accessibilityHint("Synthetic walking for the Simulator")
                Button("Debug") { debug.toggle() }
                    .tint(.gray)
                    .accessibilityAddTraits(debug ? .isSelected : [])
            }
            .buttonStyle(.bordered)

            status
            if motion.sourceID == sources.simulated.id { cadenceSlider }
            if debug { DebugReadout() }
        }
        .controlSize(.small)
        .font(.footnote)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Demo controls")
    }

    // MARK: Derived state

    private var manualActive: Bool { motion.sourceID == sources.manual.id }
    private var activityActive: Bool { motion.sourceID == sources.activity.id && motion.isRunning }
    private var manualWalking: Bool { manualActive && motion.snapshot.detected == .moving }

    @ViewBuilder
    private var status: some View {
        if let message = motion.errorMessage {
            VStack(alignment: .leading, spacing: 4) {
                Text(message).foregroundStyle(.red)
                if motion.sourceID == sources.activity.id {
                    Button("Use accelerometer") { Task { await use(sources.accelerometer) } }
                        .buttonStyle(.bordered)
                }
            }
            .accessibilityElement(children: .contain)
        } else if activityActive || motion.sourceID == sources.accelerometer.id {
            Text("Walking mode on: \(motion.snapshot.detected == .moving ? "moving" : "still"). Switches after about 5 s.")
                .foregroundStyle(.secondary)
        }
    }

    private var cadenceSlider: some View {
        VStack(alignment: .leading) {
            Text("Simulated steps: \(String(format: "%.1f", cadence)) per second")
            Slider(value: $cadence, in: 0...3, step: 0.1)
                .accessibilityLabel("Simulated steps per second")
                .onChange(of: cadence) { sources.simulated.cadence = cadence }
        }
    }

    // MARK: Actions

    private func setManual(_ on: Bool) {
        sources.manual.set(on ? .moving : .still)
        if !manualActive { Task { await use(sources.manual) } }
    }

    private func toggleActivity() {
        if activityActive {
            sources.manual.set(.still)
            Task { await use(sources.manual) }
        } else {
            Task { await use(sources.activity) }
        }
    }

    /// Switches the store to `source` and starts it. Failures show up in `motion.errorMessage`.
    private func use(_ source: any MotionSource) async {
        await motion.setSource(source)
        await motion.start()
    }
}

/// Read-only live view of the motion store. Not a live region (it updates several
/// times per second), so VoiceOver stays quiet unless the user visits it.
private struct DebugReadout: View {
    @Environment(MotionStore.self) private var motion

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.2)) { _ in
            let snapshot = motion.snapshot
            let now = motion.now()
            VStack(alignment: .leading, spacing: 2) {
                ForEach(rows(snapshot, now: now), id: \.0) { name, value in
                    HStack(alignment: .firstTextBaseline) {
                        Text(name).foregroundStyle(.secondary).frame(width: 84, alignment: .leading)
                        Text(value)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .font(.caption.monospaced())
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityLabel("Motion debug")
    }

    private func seconds(_ ms: Double) -> String { String(format: "%.1f", max(ms, 0) / 1000) }

    private func rows(_ snapshot: MotionSnapshot, now: Double) -> [(String, String)] {
        let config = motion.config
        let pending: String
        if let state = snapshot.pending, let since = snapshot.pendingSince {
            let needed = state == .moving ? config.enterMovingAfterMs : config.exitMovingAfterMs
            pending = "\(state) \(seconds(now - since))/\(seconds(needed))s"
        } else {
            pending = "—"
        }
        return [
            ("state", "\(snapshot.state)"),
            ("detected", "\(snapshot.detected)"),
            ("forced", snapshot.forced.map { "\($0)" } ?? "—"),
            ("source", "\(motion.sourceID ?? "—")\(motion.isRunning ? "" : " (off)")"),
            ("activity", snapshot.activity.map { "\($0)" } ?? "—"),
            ("cadence", String(format: "%.1f (%.1f–%.1f)", snapshot.cadence, config.minCadence, config.maxCadence)),
            ("in state", "\(seconds(now - snapshot.enteredAt))s"),
            ("pending", pending),
            ("error", motion.errorMessage ?? "—"),
            ("show-full", "\(motion.showFullState.taps)\(motion.showFullState.suppressed ? " off" : "")"),
        ]
    }
}
