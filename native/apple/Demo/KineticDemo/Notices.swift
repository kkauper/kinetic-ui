import SwiftUI

/// Wording for a notification card.
struct NoticeContent: Equatable {
    var title: String
    var body: String
    /// Offer the manual switch as a way out.
    var offerSimulate: Bool
}

/// The one place that turns `KineticSourceError` messages into user-facing wording (same structure
/// and tone as `apps/demo/src/demo-controls/notices.ts`). Matching is on stable key phrases, so a
/// reworded message falls through to the generic notice instead of showing nothing.
func noticeForError(_ error: String) -> NoticeContent {
    let e = error.lowercased()
    if e.contains("turned off") || e.contains("denied") || e.contains("not allowed") {
        return NoticeContent(
            title: "Motion access was not allowed",
            body: "Allow Motion & Fitness for this app in Settings > Privacy & Security > Motion & Fitness and try again.",
            offerSimulate: true
        )
    }
    if e.contains("restricted") {
        return NoticeContent(
            title: "Motion access is restricted",
            body: "Screen Time or a management profile blocks Motion & Fitness on this device. Simulate walking works anywhere.",
            offerSimulate: true
        )
    }
    if e.contains("activity data") {
        return NoticeContent(
            title: "This device doesn't report motion",
            body: "Try a real iPhone (the Simulator never does). Simulate walking works anywhere.",
            offerSimulate: true
        )
    }
    if e.contains("no accelerometer") || e.contains("no motion data") {
        return NoticeContent(
            title: "No motion data received",
            body: "Try on a real iPhone.",
            offerSimulate: true
        )
    }
    return NoticeContent(title: "Walking mode could not start", body: error, offerSimulate: true)
}

/// A notification card: icon in a tinted circle, title, optional body and action, optional dismiss button.
struct NoticeCard: View {
    enum Kind { case error, info }

    let kind: Kind
    let title: String
    var message: String?
    var actionTitle: String?
    var action: () -> Void = {}
    var onDismiss: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var tint: Color { kind == .error ? KColor.error : KColor.accentText }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: kind == .error ? "exclamationmark.triangle" : "info.circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 32, height: 32)
                .background(Circle().fill(tint.opacity(0.16)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(KineticFont.headline)
                    .foregroundStyle(KColor.text)
                    .padding(.top, 4)
                if let message {
                    Text(message)
                        .font(KineticFont.secondary)
                        .foregroundStyle(KColor.secondary)
                }
                if let actionTitle {
                    Button(actionTitle, action: action)
                        .buttonStyle(.pill(.soft, size: .small))
                        .padding(.top, 6)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let onDismiss {
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(KColor.secondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }
        }
        .padding(.leading, 14)
        .padding([.top, .bottom, .trailing], 8)
        .background(RoundedRectangle(cornerRadius: 8).fill(KColor.card))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(KColor.hairline, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .onAppear {
            // Errors are announced at once (the web card is role="alert"), info politely on focus only.
            if kind == .error {
                AccessibilityNotification.Announcement("\(title). \(message ?? "")").post()
            }
        }
        .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
    }
}
