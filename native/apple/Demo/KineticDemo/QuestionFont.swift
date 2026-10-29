import SwiftUI

/// Question text at `base` points or larger. The token size is a floor for the
/// moving state; Dynamic Type scales it further (never fixed sizes).
struct QuestionFont: ViewModifier {
    @ScaledMetric private var size: CGFloat

    init(base: CGFloat) {
        _size = ScaledMetric(wrappedValue: base, relativeTo: .title2)
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: .semibold))
    }
}

extension View {
    func questionFont(_ base: CGFloat) -> some View {
        modifier(QuestionFont(base: base))
    }
}
