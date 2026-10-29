import KineticUI
import SwiftUI

/// The complete form: every field, in schema order. Top-to-bottom flow, editable fields.
struct FullFormView: View {
    @Environment(FormStore.self) private var form
    @Environment(\.kineticMetrics) private var metrics

    @State private var submitted = false
    @AccessibilityFocusState private var errorFocus: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metrics.fieldGap) {
                Text(form.title)
                    .font(KineticFont.title)
                    .foregroundStyle(KColor.text)
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
                    .buttonStyle(.pill(.prominent, size: .large, fullWidth: true))

                if submitted { success }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
        }
        .scrollDismissesKeyboard(.interactively)
        // The status pill lives in the layout (an inset), so it never covers a field.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ReadoutPill()
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
        }
    }

    private var success: some View {
        VStack(alignment: .leading, spacing: metrics.gap) {
            Text("Account created (demo — nothing was sent)")
                .font(KineticFont.bodyMedium)
                .foregroundStyle(KColor.success)
                .padding(metrics.gap)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8).fill(KColor.success.opacity(0.14)))
            Button("Start over") {
                form.reset()
                submitted = false
            }
            .buttonStyle(.pill(.soft))
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
