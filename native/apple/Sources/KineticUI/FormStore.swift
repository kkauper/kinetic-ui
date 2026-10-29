import Foundation
import Observation

/// Observable wrapper around the Rust `FormModel`.
///
/// Every action goes through this store, which refreshes `state` right after the
/// model changed, so views never lag behind the model. Both presentations (full
/// form and stepper) render the same `state`, which is why answers survive a switch.
@MainActor
@Observable
public final class FormStore {
    public private(set) var state: FormState
    /// The questions in schema order.
    public let fields: [FieldSchema]
    public let title: String
    /// Deferred ids that are still unanswered.
    public private(set) var pendingDeferred: [String]

    @ObservationIgnored private let model: FormModel

    /// Builds the store from any schema JSON (see `packages/spec/schemas`).
    /// Throws `KineticError.InvalidSchema(reason:)` with the core's message.
    public init(schemaJSON: String, storage: FormStorage? = UserDefaultsFormStorage()) throws {
        let model = try FormModel(schemaJson: schemaJSON, storage: storage)
        self.model = model
        fields = model.fields()
        title = model.title()
        state = model.state()
        pendingDeferred = model.pendingDeferred()
    }

    /// The sign-up form shared with the web demo. The bundled schema is validated by
    /// the Rust tests, so failing here is a programmer error.
    public convenience init(storage: FormStorage? = UserDefaultsFormStorage()) {
        // swiftlint:disable:next force_try
        try! self.init(schemaJSON: signupSchemaJson(), storage: storage)
    }

    // MARK: Actions (forwarded to the model)

    public func setAnswer(_ id: String, _ value: AnswerValue?) {
        // Only fails for an id the schema does not have, which the views take from `fields`.
        do { try model.setAnswer(id: id, value: value) } catch { assertionFailure("\(error)") }
        refresh()
    }

    /// Validates the current field; on success advances and returns true.
    @discardableResult
    public func next() -> Bool {
        let advanced = model.next()
        refresh()
        return advanced
    }

    public func back() {
        model.back()
        refresh()
    }

    public func goTo(_ step: Int) {
        model.goTo(step: Int32(clamping: step))
        refresh()
    }

    /// Postpones a deferrable field (default: the current one).
    @discardableResult
    public func `defer`(_ id: String? = nil) -> Bool {
        let deferred = model.defer(id: id)
        refresh()
        return deferred
    }

    public func jumpToFirstUnanswered() {
        model.jumpToFirstUnanswered()
        refresh()
    }

    /// Validates every field; true if there are no errors.
    @discardableResult
    public func validateAll() -> Bool {
        let valid = model.validateAll()
        refresh()
        return valid
    }

    /// Clears answers and stored data and returns to the first step.
    public func reset() {
        model.reset()
        refresh()
    }

    public func isAnswered(_ id: String) -> Bool {
        (try? model.isAnswered(id: id)) ?? false
    }

    private func refresh() {
        let newState = model.state()
        if newState != state { state = newState }
        pendingDeferred = model.pendingDeferred()
    }
}

/// Keeps the answers in `UserDefaults` under `kinetic-ui:signup`, the same key and
/// JSON as the web demo's localStorage entry.
public final class UserDefaultsFormStorage: FormStorage, @unchecked Sendable {
    public static let signupKey = "kinetic-ui:signup"

    private let defaults: UserDefaults
    private let key: String

    public init(defaults: UserDefaults = .standard, key: String = UserDefaultsFormStorage.signupKey) {
        self.defaults = defaults
        self.key = key
    }

    public func load() -> String? { defaults.string(forKey: key) }
    public func save(json: String) { defaults.set(json, forKey: key) }
    public func clear() { defaults.removeObject(forKey: key) }
}
