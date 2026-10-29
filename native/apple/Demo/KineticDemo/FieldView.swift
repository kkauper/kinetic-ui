import KineticUI
import SwiftUI
import UIKit

// Why there is no `Binding(get:set:)` below: with Xcode 26.6 / Swift 6.3 (language mode 6) the
// x86_64 simulator slice crashes in IRGen on the reabstraction thunk for that initializer's
// `@isolated(any) @Sendable (Value) -> Void` setter. Controls bind to a local `@State` mirror
// instead, kept in sync with the model by `onChange(of:)` in both directions.

enum Presentation {
    /// The complete form: label, control and error per field.
    case full
    /// One question at a time: the step heading carries the label.
    case step
}

/// Accessibility-focus key of the control that answers `field` (nil for text, which takes keyboard focus).
/// The stepper moves VoiceOver there on every step change.
func controlFocusKey(for field: FieldSchema, value: AnswerValue?) -> String? {
    switch field.kind {
    case .text:
        return nil
    case .choice(let options):
        if case .text(let selected)? = value, options.contains(where: { $0.value == selected }) {
            return "control:\(field.id):\(selected)"
        }
        return options.first.map { "control:\(field.id):\($0.value)" }
    case .toggle:
        return "control:\(field.id):\(value == AnswerValue.bool(value: false) ? "no" : "yes")"
    case .slider:
        return "control:\(field.id)"
    }
}

/// One renderer per field kind, shared by the full form and the stepper.
/// Sizes come from `kineticMetrics`; the view never asks why the state is what it is.
///
/// Text steps: every text-like field (plain or email) goes through the same `TextLikeInput` at the
/// same place in the view tree and the stepper does not key this view by field id, so SwiftUI keeps
/// one `UITextField`: its focus, and with it the keyboard, survive from one text step to the next.
struct FieldView: View {
    let field: FieldSchema
    let value: AnswerValue?
    let error: String?
    let presentation: Presentation
    var isDeferred = false
    /// Accessibility focus target for validation errors (the field's id) and for controls (`controlFocusKey`).
    var focus: AccessibilityFocusState<String?>.Binding
    var onSubmit: () -> Void = {}
    let onChange: (AnswerValue?) -> Void

    @Environment(\.kineticMetrics) private var metrics

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.gap) {
            if showsLabel { label }
            if let hint = field.hint {
                Text(hint).font(KineticFont.secondary).foregroundStyle(KColor.secondary)
            }
            control
            if let error {
                Text(error)
                    .font(KineticFont.secondary)
                    .foregroundStyle(KColor.error)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityFocused(focus, equals: field.id)
            }
        }
        // "Saved for later": a 3 pt accent bar in the leading margin, outside the content edge (plus the badge).
        .overlay(alignment: .leading) {
            if isDeferred {
                Capsule()
                    .fill(KColor.accent)
                    .frame(width: 3)
                    .offset(x: -10)
                    .accessibilityHidden(true)
            }
        }
    }

    /// Toggles in the full form carry their label inside the `Toggle`; in the
    /// stepper the heading above is the label.
    private var showsLabel: Bool {
        guard presentation == .full else { return false }
        if case .toggle = field.kind { return false }
        return true
    }

    private var label: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(field.label).questionFont(metrics.fontQuestion)
            if isDeferred {
                Text("Saved for later")
                    .font(KineticFont.captionStrong)
                    .foregroundStyle(KColor.amber)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(KColor.amber.opacity(0.16)))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private var control: some View {
        switch field.kind {
        case .text(let format, let autocomplete):
            TextLikeInput(field: field, value: value, format: format, autocomplete: autocomplete, error: error,
                          presentation: presentation, onSubmit: onSubmit, onChange: onChange)
        case .choice(let options):
            ChoiceCards(field: field, options: options, value: value, presentation: presentation, focus: focus, onChange: onChange)
        case .toggle:
            ToggleControl(field: field, value: value, presentation: presentation, focus: focus, onChange: onChange)
        case .slider(let min, let max, let step, let valueLabels, let defaultValue):
            SliderControl(field: field, range: min...max, step: step, valueLabels: valueLabels,
                          defaultValue: defaultValue, value: value, presentation: presentation, focus: focus, onChange: onChange)
        }
    }
}

// MARK: - Text

private func answerText(_ value: AnswerValue?) -> String {
    if case .text(let string)? = value { return string }
    return ""
}

private func contentType(for autocomplete: String?) -> UITextContentType? {
    switch autocomplete {
    case "email": .emailAddress
    case "given-name": .givenName
    case "family-name": .familyName
    case "name": .name
    default: nil
    }
}

/// The text input for every text-like question (plain text and email). One view, one `TextField`:
/// prompt, keyboard type, content type and capitalization change in place from field to field.
/// In the stepper it owns the keyboard focus: it takes focus when it appears and again on each
/// step change (a no-op while it already has it, which is what keeps the keyboard up), and Return
/// is Next. Buttons do not take focus in SwiftUI, so tapping Back/Next/Later leaves it alone.
private struct TextLikeInput: View {
    let field: FieldSchema
    let value: AnswerValue?
    let format: TextFormat?
    let autocomplete: String?
    let error: String?
    let presentation: Presentation
    let onSubmit: () -> Void
    let onChange: (AnswerValue?) -> Void

    @Environment(\.kineticMetrics) private var metrics
    @FocusState private var isFocused: Bool
    @State private var text = ""
    /// The typo suggestion appears after a pause in typing, or immediately on blur.
    @State private var settledText = ""

    private static let suggestDelay: Duration = .milliseconds(500)

    private var isEmail: Bool { format == .email }

    var body: some View {
        let suggestion = isEmail && settledText == text ? suggestEmailDomain(value: text) : nil
        let completions = isEmail ? emailDomainCompletions(value: text) : []

        VStack(alignment: .leading, spacing: metrics.gap) {
            TextField(field.label, text: $text)
                .keyboardType(isEmail ? .emailAddress : .default)
                .textContentType(contentType(for: autocomplete))
                .textInputAutocapitalization(isEmail ? .never : .words)
                .autocorrectionDisabled(isEmail)
                .submitLabel(presentation == .step ? .next : .done)
                .focused($isFocused)
                .onSubmit {
                    if isEmail { normalize() }
                    onSubmit()
                }
                .onChange(of: isFocused) { _, focused in
                    if !focused && isEmail { normalize() }
                }
                .kineticFieldChrome(minHeight: metrics.targetMin, focused: isFocused, invalid: error != nil)
                .accessibilityLabel(field.label)
                .accessibilityHint(error ?? "")

            if !completions.isEmpty {
                chips(completions)
            }
            if let suggestion {
                suggestionRow(suggestion)
            }
        }
        .onChange(of: value, initial: true) { _, newValue in
            if text != answerText(newValue) { text = answerText(newValue) }
        }
        .onChange(of: text) { _, newText in
            if newText != answerText(value) { set(newText) }
        }
        .onChange(of: field.id) {
            // Same input, next question: show its answer and keep (or take back) the focus.
            if text != answerText(value) { text = answerText(value) }
            settledText = text
            if presentation == .step { isFocused = true }
        }
        .task {
            // First appearance in the stepper (coming from a choice step): open the keyboard.
            guard presentation == .step else { return }
            await Task.yield()
            isFocused = true
        }
        .task(id: text) {
            try? await Task.sleep(for: Self.suggestDelay)
            if !Task.isCancelled { settledText = text }
        }
    }

    private func set(_ next: String) {
        onChange(next.isEmpty ? nil : .text(value: next))
    }

    private func normalize() {
        let normalized = normalizeEmail(value: text)
        if normalized != text {
            text = normalized
            set(normalized)
        }
        settledText = normalized
    }

    private func chips(_ completions: [EmailCompletion]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(completions, id: \.domain) { completion in
                    Button("@\(completion.domain)") { text = completion.email }
                        .buttonStyle(.pill(.soft, size: .small))
                        .accessibilityLabel("Complete with \(completion.domain)")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Complete email address")
    }

    private func suggestionRow(_ suggestion: EmailCompletion) -> some View {
        HStack {
            Text("Did you mean \(suggestion.email)?")
                .font(KineticFont.secondary)
                .foregroundStyle(KColor.secondary)
            Button("Use \(suggestion.domain)") { text = suggestion.email }
                .buttonStyle(.pill(.soft, size: .small))
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Choice and toggle

/// A large tappable card; selection is shown by an accent border and a check mark (not color alone)
/// and announced with the `isSelected` trait.
private struct OptionCard: View {
    let title: String
    let isSelected: Bool
    let focus: AccessibilityFocusState<String?>.Binding
    let focusKey: String
    let action: () -> Void
    @Environment(\.kineticMetrics) private var metrics

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(KineticFont.bodyMedium)
                    .foregroundStyle(KColor.text)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: metrics.gap)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? KColor.accent : KColor.border)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, metrics.gap)
            .frame(maxWidth: .infinity, minHeight: metrics.targetMin, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? KColor.accent.opacity(0.15) : KColor.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(isSelected ? KColor.accent : KColor.border, lineWidth: isSelected ? 2 : 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityFocused(focus, equals: focusKey)
    }
}

private struct ChoiceCards: View {
    let field: FieldSchema
    let options: [ChoiceOption]
    let value: AnswerValue?
    let presentation: Presentation
    let focus: AccessibilityFocusState<String?>.Binding
    let onChange: (AnswerValue?) -> Void
    @Environment(\.kineticMetrics) private var metrics

    var body: some View {
        let selected = answerText(value)
        let columns = presentation == .step
            ? [GridItem(.flexible())]
            : [GridItem(.adaptive(minimum: 150), spacing: metrics.gap)]
        LazyVGrid(columns: columns, spacing: metrics.gap) {
            ForEach(options, id: \.value) { option in
                OptionCard(title: option.label, isSelected: option.value == selected,
                           focus: focus, focusKey: "control:\(field.id):\(option.value)") {
                    onChange(.text(value: option.value))
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(field.label)
    }
}

/// Full form: a switch. Stepper: Yes/No cards, because a small switch that
/// auto-advances on tap is ambiguous. The stored value is a boolean either way.
private struct ToggleControl: View {
    let field: FieldSchema
    let value: AnswerValue?
    let presentation: Presentation
    let focus: AccessibilityFocusState<String?>.Binding
    let onChange: (AnswerValue?) -> Void
    @Environment(\.kineticMetrics) private var metrics
    @State private var isOn = false

    var body: some View {
        if presentation == .step {
            HStack(spacing: metrics.gap) {
                OptionCard(title: "Yes", isSelected: value == AnswerValue.bool(value: true),
                           focus: focus, focusKey: "control:\(field.id):yes") { onChange(.bool(value: true)) }
                OptionCard(title: "No", isSelected: value == AnswerValue.bool(value: false),
                           focus: focus, focusKey: "control:\(field.id):no") { onChange(.bool(value: false)) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(field.label)
        } else {
            Toggle(field.label, isOn: $isOn)
                .toggleStyle(KineticToggleStyle())
                .font(KineticFont.bodyMedium)
                .onChange(of: value, initial: true) { _, newValue in
                    let on = newValue == AnswerValue.bool(value: true)
                    if isOn != on { isOn = on }
                }
                .onChange(of: isOn) { _, on in
                    if on != (value == AnswerValue.bool(value: true)) { onChange(.bool(value: on)) }
                }
                .frame(minHeight: metrics.targetMin)
        }
    }
}

// MARK: - Slider

private struct SliderControl: View {
    let field: FieldSchema
    let range: ClosedRange<Double>
    let step: Double
    let valueLabels: [String: String]
    let defaultValue: Double?
    let value: AnswerValue?
    let presentation: Presentation
    let focus: AccessibilityFocusState<String?>.Binding
    let onChange: (AnswerValue?) -> Void
    @Environment(\.kineticMetrics) private var metrics
    @State private var position = 0.0

    private var answered: Bool {
        if case .number? = value { return true }
        return false
    }

    /// Display only: the default is shown but not stored until the user interacts.
    private var shown: Double {
        if case .number(let number)? = value { return number }
        return defaultValue ?? range.lowerBound
    }

    private var valueLabel: String {
        let key = shown == shown.rounded() ? String(Int(shown)) : String(shown)
        return valueLabels[key] ?? key
    }

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.gap) {
            Text(valueLabel + (answered ? "" : presentation == .step ? " — press Next to confirm" : " (not set yet)"))
                .font(KineticFont.custom(20, .medium, relativeTo: .title3))
                .foregroundStyle(KColor.text)
                .accessibilityHidden(true)  // the slider itself speaks the value
            KineticSlider(
                value: $position, range: range, step: step,
                trackHeight: presentation == .step ? KineticTokens.Moving.sliderTrack : 8,
                thumbSize: presentation == .step ? KineticTokens.Moving.sliderThumb : 24,
                minHeight: metrics.targetMin
            )
            .onChange(of: shown, initial: true) { _, newShown in
                if position != newShown { position = newShown }
            }
            .onChange(of: position) { _, newPosition in
                // Only a real move is stored; syncing the displayed default must not answer the question.
                if newPosition != shown { onChange(.number(value: newPosition)) }
            }
            .accessibilityLabel(field.label)
            .accessibilityValue(answered ? valueLabel : "\(valueLabel), not set yet")
            .accessibilityFocused(focus, equals: "control:\(field.id)")
        }
    }
}
