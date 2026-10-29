import Foundation

/// Sizes for one motion state, from the design tokens. Views take these from the
/// environment (`\.kineticMetrics`) and never hard-code the walking sizes.
public struct KineticMetrics: Equatable, Sendable {
    /// Minimum tap target, in points.
    public var targetMin: CGFloat
    public var gap: CGFloat
    public var fieldGap: CGFloat
    /// Question text size. A floor for Dynamic Type, not a fixed size.
    public var fontQuestion: CGFloat
    public var thumbZonePad: CGFloat

    public init(targetMin: CGFloat, gap: CGFloat, fieldGap: CGFloat, fontQuestion: CGFloat, thumbZonePad: CGFloat) {
        self.targetMin = targetMin
        self.gap = gap
        self.fieldGap = fieldGap
        self.fontQuestion = fontQuestion
        self.thumbZonePad = thumbZonePad
    }

    public static let still = KineticMetrics(
        targetMin: KineticTokens.Still.targetMin, gap: KineticTokens.Still.gap,
        fieldGap: KineticTokens.Still.fieldGap, fontQuestion: KineticTokens.Still.fontQuestion,
        thumbZonePad: KineticTokens.Still.thumbZonePad
    )

    public static let moving = KineticMetrics(
        targetMin: KineticTokens.Moving.targetMin, gap: KineticTokens.Moving.gap,
        fieldGap: KineticTokens.Moving.fieldGap, fontQuestion: KineticTokens.Moving.fontQuestion,
        thumbZonePad: KineticTokens.Moving.thumbZonePad
    )

    public static func forState(_ state: MotionState) -> KineticMetrics {
        switch state {
        case .still: .still
        case .moving: .moving
        }
    }
}
