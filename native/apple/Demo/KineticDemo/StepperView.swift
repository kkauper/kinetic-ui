import KineticUI
import SwiftUI

/// One question at a time, built for thumbs. Everything sits in the lower part of the screen
/// (spacer on top, then progress, question, field), and the Back / Later / Next bar is a bottom
/// safe-area inset, which SwiftUI keeps right above the keyboard. The input is therefore always
/// next to the bar, and the keyboard moves nothing.
///
/// Focus: on every step change the step's control takes focus. Text questions share one
/// `TextField` (see `FieldView`) that holds the keyboard focus, so the keyboard stays up across
/// consecutive text steps; Buttons do not take focus in SwiftUI, so Next does not dismiss it.
/// Choice, Yes/No and slider steps move VoiceOver focus to the control; the summary moves it to its heading.
@MainActor
struct StepperView: View {
    @Environment(FormStore.self) private var form
    @Environment(\.kineticMetrics) private var metrics
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// VoiceOver focus: "heading" (summary), a field id (its error) or a `controlFocusKey`.
    @AccessibilityFocusState private var a11yFocus: String?
    @State private var advanceTask: Task<Void, Never>?
    @State private var created = false

    /// Delay so the user sees their selection before an unambiguous tap advances.
    private static let autoAdvanceDelay: Duration = .milliseconds(300)
    private static let swipeMinDistance: CGFloat = 60

    private var step: Int { Int(form.state.currentStep) }
    private var count: Int { form.fields.count }
    private var field: FieldSchema? { form.fields.indices.contains(step) ? form.fields[step] : nil }
    private var isDone: Bool { field == nil }
    private var pending: [String] { form.pendingDeferred }
    private var answeredCount: Int { form.fields.filter { form.isAnswered($0.id) }.count }

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                content
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                    // At least the visible height, bottom-aligned: short content sits at the bottom
                    // (one thumb), long content (the summary) scrolls.
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .bottomLeading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { thumbBar }
        .simultaneousGesture(swipeBack)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: step)
        // Entering moving mode: resume at the first question that still needs an answer.
        .onAppear { form.jumpToFirstUnanswered() }
        .onChange(of: step, initial: true) {
            cancelAdvance()
            enterStep()
        }
        .onChange(of: created) { enterStep() }
    }

    // MARK: Pieces

    private var content: some View {
        VStack(alignment: .leading, spacing: metrics.gap) {
            statusRow
            heading
            if let field {
                // No `.id(field.id)`: the same view for every question keeps the text field (and its focus).
                FieldView(
                    field: field,
                    value: form.state.answers[field.id],
                    error: form.state.errors[field.id],
                    presentation: .step,
                    focus: $a11yFocus,
                    onSubmit: next,
                    onChange: { change($0, in: field) }
                )
            } else if created {
                Button("Start over") {
                    form.reset()
                    created = false
                }
                .buttonStyle(.pill(.soft))
            } else {
                SummaryView { form.goTo($0) }
            }
        }
    }

    /// Progress, the "for later" chip and the debug status pill, in the bottom group so they add no height above it.
    private var statusRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                progressText
                laterChip
                Spacer(minLength: 0)
                ReadoutPill()
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 12) {
                    progressText
                    laterChip
                }
                ReadoutPill()
            }
        }
    }

    private var progressText: some View {
        Text(progress)
            .font(KineticFont.secondary)
            .foregroundStyle(KColor.secondary)
    }

    @ViewBuilder
    private var laterChip: some View {
        if !pending.isEmpty && !isDone {
            Button(laterCount) { form.goTo(count) }
                .buttonStyle(.pill(.caution, size: .small))
        }
    }

    private var heading: some View {
        Text(headingText)
            .questionFont(metrics.fontQuestion)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
            .accessibilityFocused($a11yFocus, equals: "heading")
    }

    private var thumbBar: some View {
        VStack(spacing: 8) {
            if isDone {
                if !created {
                    HStack {
                        Button("Back") { form.back() }
                            .buttonStyle(.pill(.soft, size: .small))
                        Spacer()
                    }
                    Button("Create account", action: createAccount)
                        .buttonStyle(.pill(.prominent, size: .large, fullWidth: true))
                }
            } else {
                HStack(spacing: 12) {
                    Button("Back") {
                        cancelAdvance()
                        form.back()
                    }
                    .buttonStyle(.pill(.soft))
                    .disabled(step == 0)

                    Spacer(minLength: 0)

                    if canDefer {
                        Button("Later", action: deferCurrent)
                            .buttonStyle(.pill(.outline))
                    }
                    Button("Next", action: next)
                        .buttonStyle(.pill(.prominent))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, isDone && created ? 0 : 8)
        .padding(.bottom, isDone && created ? 0 : metrics.thumbZonePad)
        .frame(maxWidth: .infinity)
        .background(KColor.background)
    }

    // MARK: Text

    private var headingText: String {
        if let field { return field.label }
        return created ? "Account created (demo — nothing was sent)" : "Review your answers"
    }

    private var progress: String {
        if isDone { return created ? "Account created" : "Review: \(answeredCount) of \(count) answered" }
        return "Question \(step + 1) of \(count)"
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
            focusLater(field.id)
        }
    }

    private func deferCurrent() {
        cancelAdvance()
        if form.defer() { form.jumpToFirstUnanswered() }
    }

    private func createAccount() {
        form.normalizeEmailAnswers()
        if form.validateAll() {
            created = true
            return
        }
        // Back to the first invalid question; entering the step focuses its field.
        if let index = form.fields.firstIndex(where: { form.state.errors[$0.id] != nil }) {
            form.goTo(index)
        }
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

    /// New step (or the account was created): announce it and move VoiceOver focus to the control.
    /// Text questions need nothing here: the shared text field takes keyboard focus itself.
    private func enterStep() {
        let announcement: String
        let target: String?
        if let field {
            announcement = "Question \(step + 1) of \(count)"
            if form.state.errors[field.id] != nil {
                target = field.id
            } else {
                target = controlFocusKey(for: field, value: form.state.answers[field.id])
            }
        } else {
            announcement = created ? "Account created" : "Review: \(answeredCount) of \(count) answered"
            target = "heading"
        }
        a11yFocus = nil
        Task { @MainActor in
            await Task.yield()
            a11yFocus = target
            // After the focus change, so the announcement is not cut off by the new element's label.
            try? await Task.sleep(for: .milliseconds(600))
            AccessibilityNotification.Announcement(announcement).post()
        }
    }

    private func focusLater(_ id: String) {
        Task { @MainActor in
            await Task.yield()
            a11yFocus = id
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
        guard let field else { return !created }
        switch field.kind {
        case .choice, .toggle: return true
        case .text, .slider: return false
        }
    }
}
