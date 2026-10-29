import KineticUI
import SwiftUI

/// The complete form: every field, in schema order.
struct FullFormView: View {
    @Environment(FormStore.self) private var form
    @Environment(\.kineticMetrics) private var metrics

    @State private var submitted = false
    @AccessibilityFocusState private var errorFocus: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metrics.fieldGap) {
                Text(form.title)
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)

                ForEach(form.fields, id: \.id) { field in
                    FieldView(
                        field: field,
                        value: form.state.answers[field.id],
                        error: form.state.errors[field.id],
                        presentation: .full,
                        isDeferred: form.pendingDeferred.contains(field.id),
                        focus: $errorFocus,
                        onSubmit: {},
                        onChange: { value in
                            submitted = false
                            form.setAnswer(field.id, value)
                        }
                    )
                }

                Button("Create account", action: submit)
                    .buttonStyle(.borderedProminent)
                    .frame(minHeight: metrics.targetMin)

                if submitted { success }
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var success: some View {
        VStack(alignment: .leading, spacing: metrics.gap) {
            Text("Account created (demo — nothing was sent)")
                .padding(metrics.gap)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.green.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
            Button("Start over") {
                form.reset()
                submitted = false
            }
            .buttonStyle(.bordered)
            .frame(minHeight: metrics.targetMin)
        }
    }

    private func submit() {
        form.normalizeEmailAnswers()
        if form.validateAll() {
            submitted = true
            AccessibilityNotification.Announcement("Account created").post()
            return
        }
        submitted = false
        // Move VoiceOver to the first error once it is on screen.
        let first = form.fields.first { form.state.errors[$0.id] != nil }
        Task { @MainActor in
            await Task.yield()
            errorFocus = first?.id
        }
    }
}
