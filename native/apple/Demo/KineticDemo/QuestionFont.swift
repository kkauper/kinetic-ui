import SwiftUI

/// Question text at `base` points or larger, in Hanken Grotesk. The token size is a floor for the
/// moving state; Dynamic Type scales it further (`ScaledMetric`, never a fixed size).
struct QuestionFont: ViewModifier {
    @ScaledMetric private var size: CGFloat

    init(base: CGFloat) {
        _size = ScaledMetric(wrappedValue: base, relativeTo: .title2)
    }

    func body(content: Content) -> some View {
        // `fixedSize`: the size is already scaled by `ScaledMetric`, so it must not scale twice.
        content
            .font(Font.custom(KineticFont.family, fixedSize: size).weight(.semibold))
            .foregroundStyle(KColor.text)
    }
}

extension View {
    func questionFont(_ base: CGFloat) -> some View {
        modifier(QuestionFont(base: base))
    }
}
