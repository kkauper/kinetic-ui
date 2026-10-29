import KineticUI
import SwiftUI

/// The answer as the user would say it; nil when there is none.
func formatAnswer(_ field: FieldSchema, _ value: AnswerValue?) -> String? {
    guard let value else { return nil }
    switch (field.kind, value) {
    case (_, .text(let string)) where string.isEmpty:
        return nil
    case (.choice(let options), .text(let string)):
        return options.first { $0.value == string }?.label ?? string
    case (_, .text(let string)):
        return string
    case (_, .bool(let on)):
        return on ? "Yes" : "No"
    case (.slider(_, _, _, let valueLabels, _), .number(let number)):
        let key = number == number.rounded() ? String(Int(number)) : String(number)
        return valueLabels[key] ?? key
    case (_, .number(let number)):
        return number == number.rounded() ? String(Int(number)) : String(number)
    }
}

/// Read-only review: deferred questions first, then every other question with its answer and a Change pill.
struct SummaryView: View {
    @Environment(FormStore.self) private var form
    @Environment(\.kineticMetrics) private var metrics

    let onChange: (Int) -> Void

    var body: some View {
        let pending = form.pendingDeferred
        let rows = form.fields.enumerated().filter { !pending.contains($0.element.id) }

        VStack(alignment: .leading, spacing: metrics.gap) {
            if !pending.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Questions for later")
                        .font(KineticFont.headline)
                        .foregroundStyle(KColor.text)
                        .padding(.bottom, 4)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(pending, id: \.self) { id in
                        if let index = form.fields.firstIndex(where: { $0.id == id }) {
                            let label = form.fields[index].label
                            row {
                                Text(label)
                                    .font(KineticFont.secondary)
                                    .foregroundStyle(KColor.secondary)
                            } action: {
                                Button("Answer now") { onChange(index) }
                                    .buttonStyle(.pill(.soft, size: .small))
                                    .accessibilityLabel("Answer now: \(label)")
                            }
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(rows, id: \.element.id) { index, field in
                    let text = formatAnswer(field, form.state.answers[field.id])
                    row {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(field.label)
                                .font(KineticFont.secondary)
                                .foregroundStyle(KColor.secondary)
                            Text(text ?? "Not answered")
                                .font(text == nil ? KineticFont.body : KineticFont.bodyMedium)
                                .foregroundStyle(text == nil ? KColor.secondary : KColor.text)
                        }
                    } action: {
                        Button("Change") { onChange(index) }
                            .buttonStyle(.pill(.soft, size: .small))
                            .accessibilityLabel("Change: \(field.label)")
                    }
                }
            }
        }
    }

    private func row<Content: View, Action: View>(
        @ViewBuilder content: () -> Content,
        @ViewBuilder action: () -> Action
    ) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: metrics.gap) {
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                action()
            }
            .padding(.vertical, 8)
            Rectangle().fill(KColor.hairline).frame(height: 1)
        }
    }
}
