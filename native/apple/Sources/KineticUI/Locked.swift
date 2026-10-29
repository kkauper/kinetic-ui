import Foundation

/// A value behind a lock, for the sources: their callbacks run on private queues.
/// (`Synchronization.Mutex` would do, but it needs iOS 18.)
final class Locked<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value

    init(_ value: Value) { self.value = value }

    func withLock<R>(_ body: (inout Value) -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }

    var current: Value { withLock { $0 } }
}
