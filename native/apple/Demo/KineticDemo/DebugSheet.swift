import KineticUI
import SwiftUI

/// One-line opaque status pill (`○ still · 1.8 steps/s · 20 s`, `→ moving 3.1 s` while a change is
/// pending). It sits in the layout, never over content, opens the debug sheet and is shown only
/// while "Keep readout on screen" is on. Not a live region: its text is hidden from VoiceOver,
/// which gets a plain "Open debug" button.
struct ReadoutPill: View {
    @Environment(MotionStore.self) private var motion
    @Environment(DebugUI.self) private var debugUI
    @AppStorage(DebugUI.pinnedKey) private var pinned = false

    var body: some View {
        if pinned {
            TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                let snapshot = motion.snapshot
                let now = motion.now()
                Button {
                    debugUI.isOpen = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: snapshot.state == .moving ? "circle.fill" : "circle")
                            .font(.system(size: 10))
                            .accessibilityHidden(true)
                        Text(text(snapshot, now: now))
                            .font(KineticFont.custom(13, .regular, relativeTo: .footnote))
                            .monospacedDigit()
                            .lineLimit(1)
                            .accessibilityHidden(true)
                    }
                    .foregroundStyle(KColor.text)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(KColor.surface))
                    .overlay(Capsule().strokeBorder(KColor.border, lineWidth: 1))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open debug")
            }
        }
    }

    private func text(_ snapshot: MotionSnapshot, now: Double) -> String {
        var parts = [
            "\(snapshot.state)",
            String(format: "%.1f steps/s", snapshot.cadence),
            "\(Int(max(now - snapshot.enteredAt, 0) / 1000)) s",
        ]
        if let pending = snapshot.pending, let since = snapshot.pendingSince {
            parts.append("→ \(pending) \(String(format: "%.1f", max(now - since, 0) / 1000)) s")
        }
        return parts.joined(separator: " · ")
    }
}

/// The debug bottom sheet: live readout, pin toggle, simulated steps, walking band, resets.
struct DebugSheet: View {
    @Environment(MotionStore.self) private var motion
    @Environment(DemoSources.self) private var sources
    @Environment(FormStore.self) private var form
    @Environment(DebugUI.self) private var debugUI
    @AppStorage(DebugUI.pinnedKey) private var pinned = false
    // Local mirror of `pinned` (see the note about Binding(get:set:) at the top of FieldView.swift).
    @State private var pinnedMirror = false
    @State private var cadence = 1.8

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                section("Live readout") {
                    DebugReadout()
                    Toggle("Keep readout on screen", isOn: $pinnedMirror)
                        .toggleStyle(KineticToggleStyle())
                        .frame(minHeight: 44)
                }
                section("Simulated steps") {
                    Text("\(String(format: "%.1f", cadence)) per second")
                        .font(KineticFont.secondary)
                        .foregroundStyle(KColor.secondary)
                    KineticSlider(value: $cadence, range: 0...3, step: 0.1)
                        .accessibilityLabel("Simulated steps per second")
                    HStack(spacing: 8) {
                        Button("Use simulator") {
                            sources.simulated.cadence = cadence
                            Task { await sources.use(sources.simulated, in: motion) }
                        }
                        .buttonStyle(.pill(.soft))
                        Button("Use accelerometer") { Task { await sources.use(sources.accelerometer, in: motion) } }
                            .buttonStyle(.pill(.soft))
                    }
                }
                section("Walking band (steps per second)") {
                    HStack(alignment: .top, spacing: 12) {
                        BandField(label: "Min cadence", band: .min)
                        BandField(label: "Max cadence", band: .max)
                    }
                }
                section("Reset") {
                    VStack(alignment: .leading, spacing: 8) {
                        Button("Reset Show-full session") { motion.resetShowFullSession() }
                            .buttonStyle(.pill(.soft))
                        Button("Clear saved answers") { form.reset() }
                            .buttonStyle(.pill(.caution))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(KColor.background)
        .preferredColorScheme(.dark)
        .onAppear {
            pinnedMirror = pinned
            cadence = sources.simulated.cadence
        }
        .onChange(of: pinnedMirror) { _, on in
            if pinned != on { pinned = on }
        }
        .onChange(of: pinned) { _, on in
            if pinnedMirror != on { pinnedMirror = on }
        }
    }

    private var header: some View {
        HStack {
            Text("Debug")
                .font(KineticFont.title)
                .foregroundStyle(KColor.text)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button {
                debugUI.isOpen = false
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(KColor.text)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(KColor.surface))
                    .overlay(Circle().strokeBorder(KColor.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close debug")
        }
        .padding(.top, 16)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(KineticFont.headline)
                .foregroundStyle(KColor.text)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }
}

/// One cadence-band bound. Invalid input (not a number, min >= max) stays in the field but is not applied.
private struct BandField: View {
    enum Band { case min, max }

    let label: String
    let band: Band
    @Environment(MotionStore.self) private var motion
    @State private var text = ""

    private var parsed: Double? {
        guard let value = Double(text.replacingOccurrences(of: ",", with: ".")) else { return nil }
        let config = motion.config
        let valid = band == .min ? value < config.maxCadence : value > config.minCadence
        return valid ? value : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(KineticFont.secondary)
                .foregroundStyle(KColor.secondary)
            TextField(label, text: $text)
                .keyboardType(.decimalPad)
                .kineticFieldChrome(minHeight: 44, invalid: parsed == nil)
                .accessibilityLabel(label)
                .accessibilityHint(parsed == nil ? "Invalid: min must stay below max" : "")
        }
        .onAppear {
            let current = band == .min ? motion.config.minCadence : motion.config.maxCadence
            text = String(format: "%g", current)
        }
        .onChange(of: text) {
            guard let value = parsed else { return }
            var config = motion.config
            if band == .min { config.minCadence = value } else { config.maxCadence = value }
            motion.configure(config)
        }
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
                        Text(name).foregroundStyle(KColor.secondary).frame(width: 84, alignment: .leading)
                        Text(value).foregroundStyle(KColor.text)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .font(KineticFont.mono)
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
