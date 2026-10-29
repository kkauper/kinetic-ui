#if canImport(SwiftUI)
import SwiftUI

extension EnvironmentValues {
    /// The effective motion state (forced or detected). Components read this,
    /// never a source: the same rule as the web, where they read `data-motion`.
    @Entry public var motionState: MotionState = .still
    /// Sizes for `motionState`.
    @Entry public var kineticMetrics: KineticMetrics = .still
}

private struct KineticMotionModifier: ViewModifier {
    let store: MotionStore

    func body(content: Content) -> some View {
        let state = store.snapshot.state
        content
            .environment(\.motionState, state)
            .environment(\.kineticMetrics, .forState(state))
    }
}

extension View {
    /// Injects `motionState` and `kineticMetrics` from the store into this view tree.
    public func kineticMotion(_ store: MotionStore) -> some View {
        modifier(KineticMotionModifier(store: store))
    }
}
#endif
