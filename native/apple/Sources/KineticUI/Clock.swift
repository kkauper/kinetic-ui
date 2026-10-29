import Foundation

/// A clock in milliseconds.
///
/// One rule from the Rust core: sample timestamps and the engine's `now` must
/// come from the same clock. `MotionStore` hands its `Now` to every source, and
/// sources stamp their samples with it.
public typealias Now = @Sendable () -> Double

/// Wall-clock milliseconds since 1970, the default clock (same as `Date.now()` on the web).
public let systemNow: Now = { Date().timeIntervalSince1970 * 1000 }
