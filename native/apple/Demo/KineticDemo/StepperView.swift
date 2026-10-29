import KineticUI
import SwiftUI

/// One question at a time, built for thumbs: bottom bar, big targets, no surprise keyboards.
@MainActor
struct StepperView: View {
    @Environment(FormStore.self) private var form
    @Environment(MotionStore.self) private var motion
    @Environment(\.kineticMetrics) private var metrics
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Accessibility focus lands on the question heading on every step change, not on an input.
    @AccessibilityFocusState private var headingFocused: Bool
    @AccessibilityFocusState private var errorFocus: String?
    @State private var advanceTask: Task<Void, Never>?

    /// Delay so the user sees their selection before an unambiguous tap advances.
    private static let autoAdvanceDelay: Duration = .milliseconds(300)
    private static let swipeMinDistance: CGFloat = 60

    private var step: Int { Int(form.state.currentStep) }
    private var count: Int { form.fields.count }
    private var field: FieldSchema? { form.fields.indices.contains(step) ? form.fields[step] : nil }
    private var isDone: Bool { field == nil }
    private var pending: [String] { form.pendingDeferred }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: metrics.fieldGap) {
                    heading
                    if let field {
                        FieldView(
                            field: field,
                            value: form.state.answers[field.id],
                            error: form.state.errors[field.id],
                            presentation: .step,
                            focus: $errorFocus,
                            onSubmit: next,
                            onChange: { change($0, in: field) }
                        )
                        .id(field.id)
                    } else {
                        doneContent
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { thumbBar }
        .simultaneousGesture(swipeBack)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: step)
        // Entering moving mode: resume at the first question that still needs an answer.
        .onAppear { form.jumpToFirstUnanswered() }
        .onChange(of: step, initial: true) {
            cancelAdvance()
            focusHeading()
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack {
            Text(progress).foregroundStyle(.secondary)
                .accessibilityHidden(true)  // the heading's label carries it
            Spacer()
            if !pending.isEmpty {
                Button(laterCount) { form.goTo(count) }
                    .buttonStyle(.bordered)
                    .tint(.orange)
                    .frame(minHeight: metrics.targetMin)
            }
        }
        .padding(.horizontal)
    }

    private var heading: some View {
        Text(field?.label ?? "That's everything for now")
            .questionFont(metrics.fontQuestion)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
            // Speaks the position first: "Question 2 of 5. First name".
            .accessibilityLabel("\(progress). \(field?.label ?? "That's everything for now")")
            .accessibilityFocused($headingFocused)
            .id("heading-\(step)")
    }

    @ViewBuilder
    private var doneContent: some View {
        if !pending.isEmpty {
            VStack(alignment: .leading, spacing: metrics.gap) {
                Text(laterCount).font(.headline).accessibilityAddTraits(.isHeader)
                ForEach(pending, id: \.self) { id in
                    if let index = form.fields.firstIndex(where: { $0.id == id }) {
                        Button(form.fields[index].label) { form.goTo(index) }
                            .buttonStyle(.bordered)
                            .frame(minHeight: metrics.targetMin)
                    }
                }
            }
        }
        Button("Review full form") { motion.showFull() }
            .buttonStyle(.bordered)
            .frame(minHeight: metrics.targetMin)
    }

    private var thumbBar: some View {
        HStack(spacing: metrics.gap) {
            Button("Back") {
                cancelAdvance()
                form.back()
            }
            .buttonStyle(.bordered)
            .tint(.gray)
            .disabled(step == 0)
            .frame(minWidth: metrics.targetMin, minHeight: metrics.targetMin)

            Spacer()

            if !isDone {
                if canDefer {
                    Button("Later", action: deferCurrent)
                        .buttonStyle(.bordered)
                        .frame(minWidth: metrics.targetMin, minHeight: metrics.targetMin)
                }
                Button("Next", action: next)
                    .buttonStyle(.borderedProminent)
                    .frame(minWidth: metrics.targetMin, minHeight: metrics.targetMin)
            }
        }
        .padding(metrics.thumbZonePad)
        .background(.bar)
    }

    // MARK: Text

    private var progress: String {
        isDone ? "All questions visited" : "Question \(step + 1) of \(count)"
    }

    private var laterCount: String {
        "\(pending.count) \(pending.count == 1 ? "question" : "questions") for later"
    }

    // MARK: Actions

    private var canDefer: Bool {
        guard let field else { return false }
        return field.deferrable && !form.isAnswered(field.id)
    }

    private func next() {
        cancelAdvance()
        form.normalizeEmailAnswers()
        // An unanswered slider shows a value; pressing Next confirms it explicitly.
        if let field, case .slider(let min, _, _, _, let defaultValue) = field.kind, !form.isAnswered(field.id) {
            form.setAnswer(field.id, .number(value: defaultValue ?? min))
        }
        if form.next() {
            form.jumpToFirstUnanswered()
        } else if let field {
            focusError(field.id)
        }
    }

    private func deferCurrent() {
        cancelAdvance()
        if form.defer() { form.jumpToFirstUnanswered() }
    }

    private func change(_ value: AnswerValue?, in field: FieldSchema) {
        form.setAnswer(field.id, value)
        switch field.kind {
        case .choice, .toggle:
            // Unambiguous taps advance after a short pause; text and sliders wait for Next.
            cancelAdvance()
            advanceTask = Task { @MainActor in
                try? await Task.sleep(for: Self.autoAdvanceDelay)
                if !Task.isCancelled { next() }
            }
        default:
            break
        }
    }

    private func cancelAdvance() {
        advanceTask?.cancel()
        advanceTask = nil
    }

    private func focusHeading() {
        headingFocused = false
        Task { @MainActor in
            await Task.yield()
            headingFocused = true
        }
    }

    private func focusError(_ id: String) {
        Task { @MainActor in
            await Task.yield()
            errorFocus = id
        }
    }

    // MARK: Swipe right = back

    /// Horizontal swipe right (at least 60 pt, mostly horizontal). Ignored on text and
    /// slider questions, where horizontal drags belong to the control.
    private var swipeBack: some Gesture {
        DragGesture(minimumDistance: Self.swipeMinDistance)
            .onEnded { drag in
                let dx = drag.translation.width
                let dy = drag.translation.height
                guard dx > Self.swipeMinDistance, abs(dx) > 2 * abs(dy), swipeAllowed else { return }
                cancelAdvance()
                form.back()
            }
    }

    private var swipeAllowed: Bool {
        guard let field else { return true }
        switch field.kind {
        case .choice, .toggle: return true
        case .text, .slider: return false
        }
    }
}
