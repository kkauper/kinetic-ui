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

/// One renderer per field kind, shared by the full form and the stepper.
/// Sizes come from `kineticMetrics`; the view never asks why the state is what it is.
struct FieldView: View {
    let field: FieldSchema
    let value: AnswerValue?
    let error: String?
    let presentation: Presentation
    var isDeferred = false
    /// Accessibility focus target for validation errors (the field's id).
    var focus: AccessibilityFocusState<String?>.Binding
    var onSubmit: () -> Void = {}
    let onChange: (AnswerValue?) -> Void

    @Environment(\.kineticMetrics) private var metrics

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.gap) {
            if showsLabel { label }
            if let hint = field.hint {
                Text(hint).font(.footnote).foregroundStyle(.secondary)
            }
            control
            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .accessibilityFocused(focus, equals: field.id)
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
        HStack {
            Text(field.label).questionFont(metrics.fontQuestion)
            if isDeferred {
                Text("Saved for later")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(.orange.opacity(0.25), in: Capsule())
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private var control: some View {
        switch field.kind {
        case .text(let format, let autocomplete):
            if format == .email {
                EmailInput(field: field, value: value, error: error, presentation: presentation,
                           onSubmit: onSubmit, onChange: onChange)
            } else {
                PlainTextInput(field: field, value: value, autocomplete: autocomplete, error: error,
                               presentation: presentation, onSubmit: onSubmit, onChange: onChange)
            }
        case .choice(let options):
            ChoiceCards(field: field, options: options, value: value, presentation: presentation, onChange: onChange)
        case .toggle:
            ToggleControl(field: field, value: value, presentation: presentation, onChange: onChange)
        case .slider(let min, let max, let step, let valueLabels, let defaultValue):
            SliderControl(field: field, range: min...max, step: step, valueLabels: valueLabels,
                          defaultValue: defaultValue, value: value, presentation: presentation, onChange: onChange)
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

private struct PlainTextInput: View {
    let field: FieldSchema
    let value: AnswerValue?
    let autocomplete: String?
    let error: String?
    let presentation: Presentation
    let onSubmit: () -> Void
    let onChange: (AnswerValue?) -> Void
    @Environment(\.kineticMetrics) private var metrics

    @State private var text = ""

    var body: some View {
        TextField(field.label, text: $text)
            .textFieldStyle(.roundedBorder)
            .textContentType(contentType(for: autocomplete))
            .submitLabel(presentation == .step ? .next : .done)
            .onSubmit(onSubmit)
            .frame(minHeight: metrics.targetMin)
            .accessibilityHint(error ?? "")
            .onChange(of: value, initial: true) { _, newValue in
                if text != answerText(newValue) { text = answerText(newValue) }
            }
            .onChange(of: text) { _, newText in
                if newText != answerText(value) { onChange(newText.isEmpty ? nil : .text(value: newText)) }
            }
    }
}

/// Email input with the right keyboard, one-tap domain chips and a typo suggestion.
private struct EmailInput: View {
    let field: FieldSchema
    let value: AnswerValue?
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

    var body: some View {
        let suggestion = settledText == text ? suggestEmailDomain(value: text) : nil
        let completions = emailDomainCompletions(value: text)

        VStack(alignment: .leading, spacing: metrics.gap) {
            TextField(field.label, text: $text)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(presentation == .step ? .next : .done)
                .focused($isFocused)
                .onSubmit {
                    normalize()
                    onSubmit()
                }
                .onChange(of: isFocused) { _, focused in
                    if !focused { normalize() }
                }
                .frame(minHeight: metrics.targetMin)
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
            HStack(spacing: metrics.gap / 2) {
                ForEach(completions, id: \.domain) { completion in
                    Button("@\(completion.domain)") { text = completion.email }
                        .buttonStyle(.bordered)
                        .frame(minHeight: metrics.targetMin)
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
            Button("Use \(suggestion.domain)") { text = suggestion.email }
                .buttonStyle(.bordered)
                .frame(minHeight: metrics.targetMin)
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Choice and toggle

/// A large tappable card; selection is announced with the `isSelected` trait.
private struct OptionCard: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.kineticMetrics) private var metrics

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title).multilineTextAlignment(.leading)
                Spacer(minLength: metrics.gap)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : .secondary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, metrics.gap)
            .frame(maxWidth: .infinity, minHeight: metrics.targetMin, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.accentColor.opacity(0.15) : Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.accentColor : .clear, lineWidth: 2)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct ChoiceCards: View {
    let field: FieldSchema
    let options: [ChoiceOption]
    let value: AnswerValue?
    let presentation: Presentation
    let onChange: (AnswerValue?) -> Void
    @Environment(\.kineticMetrics) private var metrics

    var body: some View {
        let selected = answerText(value)
        let columns = presentation == .step
            ? [GridItem(.flexible())]
            : [GridItem(.adaptive(minimum: 150), spacing: metrics.gap)]
        LazyVGrid(columns: columns, spacing: metrics.gap) {
            ForEach(options, id: \.value) { option in
                OptionCard(title: option.label, isSelected: option.value == selected) {
                    onChange(.text(value: option.value))
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(field.label)
    }
}

/// Full form: a `Toggle`. Stepper: Yes/No cards, because a small switch that
/// auto-advances on tap is ambiguous. The stored value is a boolean either way.
private struct ToggleControl: View {
    let field: FieldSchema
    let value: AnswerValue?
    let presentation: Presentation
    let onChange: (AnswerValue?) -> Void
    @Environment(\.kineticMetrics) private var metrics
    @State private var isOn = false

    var body: some View {
        if presentation == .step {
            HStack(spacing: metrics.gap) {
                OptionCard(title: "Yes", isSelected: value == AnswerValue.bool(value: true)) { onChange(.bool(value: true)) }
                OptionCard(title: "No", isSelected: value == AnswerValue.bool(value: false)) { onChange(.bool(value: false)) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(field.label)
        } else {
            Toggle(field.label, isOn: $isOn)
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
                .font(.title3)
                .accessibilityHidden(true)  // the slider itself speaks the value
            Slider(value: $position, in: range, step: step)
            .frame(minHeight: metrics.targetMin)
            .onChange(of: shown, initial: true) { _, newShown in
                if position != newShown { position = newShown }
            }
            .onChange(of: position) { _, newPosition in
                // Only a real move is stored; syncing the displayed default must not answer the question.
                if newPosition != shown { onChange(.number(value: newPosition)) }
            }
            .accessibilityLabel(field.label)
            .accessibilityValue(answered ? valueLabel : "\(valueLabel), not set yet")
        }
    }
}
