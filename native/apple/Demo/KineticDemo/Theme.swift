import KineticUI
import SwiftUI

// The demo's look, matching the web demo (Radix dark theme: slate gray, blue accent).
// All values are Radix dark-mode steps; the contrast figures are measured against the page background.

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

enum KColor {
    /// slate-1: page background.
    static var background: Color { Color(hex: 0x111113) }
    /// slate-2: notification cards.
    static var card: Color { Color(hex: 0x18191B) }
    /// slate-3: surfaces (inputs, cards, tags).
    static var surface: Color { Color(hex: 0x212225) }
    /// slate-6: hairlines between rows.
    static var hairline: Color { Color(hex: 0x363A3F) }
    /// slate-9: boundary of every control that relies on its outline (3.68:1 on the background).
    static var border: Color { Color(hex: 0x696E77) }
    /// slate-12.
    static var text: Color { Color(hex: 0xEDEEF0) }
    /// slate-11.
    static var secondary: Color { Color(hex: 0xB0B4BA) }
    /// blue-9.
    static var accent: Color { Color(hex: 0x0090FF) }
    /// Text on accent fills: the page background gives 5.78:1, white would be 3.26:1.
    static var onAccent: Color { Color(hex: 0x111113) }
    /// blue-11: accent-colored text on dark surfaces.
    static var accentText: Color { Color(hex: 0x70B8FF) }
    /// blue-12.
    static var accentStrong: Color { Color(hex: 0xC2E6FF) }
    /// red-11.
    static var error: Color { Color(hex: 0xFF9592) }
    /// amber-11.
    static var amber: Color { Color(hex: 0xFFCA16) }
    /// green-11.
    static var success: Color { Color(hex: 0x3DD68C) }
}

/// Hanken Grotesk (OFL-1.1), bundled in the app (`Fonts/`, registered through `UIAppFonts`), never downloaded.
/// It is a variable font, so weights come from `Font.weight`. `relativeTo` keeps Dynamic Type scaling.
enum KineticFont {
    static let family = "Hanken Grotesk"

    static func custom(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        Font.custom(family, size: size, relativeTo: style).weight(weight)
    }

    static var body: Font { custom(17) }
    static var bodyMedium: Font { custom(17, .medium) }
    static var secondary: Font { custom(15, .regular, relativeTo: .subheadline) }
    static var caption: Font { custom(13, .regular, relativeTo: .footnote) }
    static var captionStrong: Font { custom(13, .semibold, relativeTo: .footnote) }
    static var headline: Font { custom(17, .semibold, relativeTo: .headline) }
    static var title: Font { custom(22, .bold, relativeTo: .title2) }
    /// Monospace stays the system face (debug readout).
    static var mono: Font { .system(.footnote, design: .monospaced) }
}

// MARK: - Pill buttons

enum PillVariant { case prominent, soft, outline, caution }
enum PillSize { case small, regular, large }

/// The one button style of the demo: always a capsule. Sizes come from `kineticMetrics`
/// (regular = target minimum, large = at least 56, small = 44).
struct PillButtonStyle: ButtonStyle {
    var variant: PillVariant = .prominent
    var size: PillSize = .regular
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        PillBody(configuration: configuration, variant: variant, size: size, fullWidth: fullWidth)
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    static func pill(_ variant: PillVariant = .prominent, size: PillSize = .regular, fullWidth: Bool = false) -> PillButtonStyle {
        PillButtonStyle(variant: variant, size: size, fullWidth: fullWidth)
    }
}

private struct PillBody: View {
    let configuration: ButtonStyleConfiguration
    let variant: PillVariant
    let size: PillSize
    let fullWidth: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.kineticMetrics) private var metrics

    private var minHeight: CGFloat {
        switch size {
        case .small: 44
        case .regular: max(metrics.targetMin, 44)
        case .large: max(metrics.targetMin, 56)
        }
    }

    private var horizontalPadding: CGFloat {
        switch size {
        case .small: 16
        case .regular: 20
        case .large: 24
        }
    }

    private var font: Font {
        switch size {
        case .small: KineticFont.custom(15, .medium, relativeTo: .subheadline)
        case .regular: KineticFont.custom(17, .semibold)
        case .large: KineticFont.custom(18, .semibold)
        }
    }

    private var foreground: Color {
        switch variant {
        case .prominent: KColor.onAccent
        case .soft: KColor.text
        case .outline: KColor.accentText
        case .caution: KColor.amber
        }
    }

    private var fill: Color {
        switch variant {
        case .prominent: KColor.accent
        case .soft: KColor.surface
        case .outline: .clear
        case .caution: KColor.amber.opacity(0.14)
        }
    }

    var body: some View {
        configuration.label
            .font(font)
            .foregroundStyle(foreground)
            .multilineTextAlignment(.center)
            .padding(.horizontal, horizontalPadding)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: minHeight)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(variant == .prominent ? Color.clear : KColor.border, lineWidth: 1))
            .contentShape(Capsule())
            .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.45)
    }
}

// MARK: - Pill tag (demo controls)

/// A pill toggle for the demo controls. `pressed == nil` is a plain button. State is shown by a
/// check icon, the accent border and tint, and the selected trait, never by color alone.
struct TagButton: View {
    let title: String
    var pressed: Bool?
    let action: () -> Void

    var body: some View {
        let on = pressed == true
        Button(action: action) {
            HStack(spacing: 8) {
                if let pressed {
                    Image(systemName: pressed ? "checkmark.circle.fill" : "circle")
                        .accessibilityHidden(true)
                }
                Text(title)
            }
            .font(KineticFont.custom(15, .medium, relativeTo: .subheadline))
            .foregroundStyle(on ? KColor.accentStrong : KColor.text)
            .padding(.leading, pressed == nil ? 16 : 12)
            .padding(.trailing, 16)
            .frame(minHeight: 44)
            .background(Capsule().fill(on ? KColor.accent.opacity(0.18) : KColor.surface))
            .overlay(Capsule().strokeBorder(on ? KColor.accent : KColor.border, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: - Inputs

extension View {
    /// Text field chrome: surface fill, 8 pt corners, slate-9 boundary (accent while focused, red on error).
    func kineticFieldChrome(minHeight: CGFloat, focused: Bool = false, invalid: Bool = false) -> some View {
        self
            .padding(.horizontal, 12)
            .frame(minHeight: minHeight)
            .background(RoundedRectangle(cornerRadius: 8).fill(KColor.surface))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(invalid ? KColor.error : focused ? KColor.accent : KColor.border, lineWidth: focused ? 2 : 1)
            )
    }
}

/// Switch with a visible off boundary (the system switch has none).
struct KineticToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(spacing: 16) {
                configuration.label
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .multilineTextAlignment(.leading)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule()
                        .fill(configuration.isOn ? KColor.accent : KColor.surface)
                        .overlay(Capsule().strokeBorder(configuration.isOn ? KColor.accent : KColor.border, lineWidth: 1.5))
                    Circle()
                        .fill(configuration.isOn ? KColor.onAccent : KColor.secondary)
                        .overlay {
                            if configuration.isOn {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(KColor.accent)
                            }
                        }
                        .frame(width: 26, height: 26)
                        .padding(3)
                }
                .frame(width: 56, height: 32)
                .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isToggle)
        .accessibilityValue(configuration.isOn ? "On" : "Off")
    }
}

/// Slider with a visible track boundary. Drawn by hand, announced as the system slider
/// (`accessibilityRepresentation`), so VoiceOver adjusts it with swipes up and down.
struct KineticSlider: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    var trackHeight: CGFloat = 8
    var thumbSize: CGFloat = 28
    var minHeight: CGFloat = 44

    var body: some View {
        GeometryReader { proxy in
            let travel = max(proxy.size.width - thumbSize, 1)
            let span = max(range.upperBound - range.lowerBound, 0.000_001)
            let fraction = min(max((value - range.lowerBound) / span, 0), 1)
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(KColor.surface)
                    .overlay(Capsule().strokeBorder(KColor.border, lineWidth: 1))
                    .frame(height: trackHeight)
                Capsule()
                    .fill(KColor.accent)
                    .frame(width: fraction * travel + thumbSize / 2, height: trackHeight)
                Circle()
                    .fill(KColor.accent)
                    .overlay(Circle().strokeBorder(KColor.background, lineWidth: 2))
                    .frame(width: thumbSize, height: thumbSize)
                    .offset(x: fraction * travel)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0).onChanged { drag in
                    let position = min(max((drag.location.x - thumbSize / 2) / travel, 0), 1)
                    let raw = range.lowerBound + position * span
                    let snapped = range.lowerBound + ((raw - range.lowerBound) / step).rounded() * step
                    let next = min(max(snapped, range.lowerBound), range.upperBound)
                    if next != value { value = next }
                }
            )
        }
        .frame(height: max(minHeight, thumbSize))
        .accessibilityRepresentation {
            Slider(value: $value, in: range, step: step)
        }
    }
}

// MARK: - Logo

/// The gyroscope from `packages/spec/brand/logo.svg` (24 x 24 grid): gimbal circle, tilted ring and an
/// axle that is broken where the ring's lower half passes in front. Stroke it with 1.5 at 24 pt scale.
struct LogoShape: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 24
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * scale, y: rect.minY + y * scale)
        }
        var path = Path()
        // <circle cx="12" cy="12" r="7.5">
        path.addEllipse(in: CGRect(x: rect.minX + 4.5 * scale, y: rect.minY + 4.5 * scale, width: 15 * scale, height: 15 * scale))
        // The two half-ellipses (rx 10, ry 3.6) together are one full ellipse.
        path.addEllipse(in: CGRect(x: rect.minX + 2 * scale, y: rect.minY + 8.4 * scale, width: 20 * scale, height: 7.2 * scale))
        // <path d="M12 2V13M12 18.2V22">
        path.move(to: point(12, 2))
        path.addLine(to: point(12, 13))
        path.move(to: point(12, 18.2))
        path.addLine(to: point(12, 22))
        return path
    }
}

struct LogoMark: View {
    var size: CGFloat = 28

    var body: some View {
        LogoShape()
            .stroke(KColor.text, style: StrokeStyle(lineWidth: 1.5 * size / 24, lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
