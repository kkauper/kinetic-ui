import Foundation
import Testing
@testable import KineticUI

final class FakeStorage: FormStorage, @unchecked Sendable {
    let json = Locked<String?>(nil)
    func load() -> String? { json.current }
    func save(json value: String) { json.withLock { $0 = value } }
    func clear() { json.withLock { $0 = nil } }
}

@MainActor
struct FormStoreTests {
    @Test func answersPersistAndRestore() {
        let storage = FakeStorage()
        let first = FormStore(storage: storage)
        first.setAnswer("email", .text(value: "a@example.com"))
        first.setAnswer("newsletter", .bool(value: true))
        #expect(storage.json.current != nil)

        let second = FormStore(storage: storage)
        #expect(second.state.answers["email"] == .text(value: "a@example.com"))
        #expect(second.state.answers["newsletter"] == .bool(value: true))
        #expect(second.isAnswered("email"))
    }

    @Test func nextValidatesAndAdvances() {
        let store = FormStore(storage: nil)
        #expect(store.fields.first?.id == "email")
        #expect(!store.next())
        #expect(store.state.errors["email"] != nil)
        #expect(store.state.currentStep == 0)

        store.setAnswer("email", .text(value: "a@example.com"))
        #expect(store.next())
        #expect(store.state.currentStep == 1)
    }

    @Test func deferringIsTrackedUntilAnswered() {
        let store = FormStore(storage: nil)
        store.goTo(1)
        #expect(store.defer())
        #expect(store.pendingDeferred == ["firstName"])
        store.setAnswer("firstName", .text(value: "Ada"))
        #expect(store.pendingDeferred.isEmpty)
    }

    @Test func resetClearsStorage() {
        let storage = FakeStorage()
        let store = FormStore(storage: storage)
        store.setAnswer("email", .text(value: "a@example.com"))
        store.reset()
        #expect(store.state.answers.isEmpty)
        #expect(storage.json.current == nil)
    }

    @Test func userDefaultsStorageRoundTrips() throws {
        let suite = "kinetic-ui.tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let storage = UserDefaultsFormStorage(defaults: defaults)
        #expect(storage.load() == nil)
        storage.save(json: "{}")
        #expect(storage.load() == "{}")
        storage.clear()
        #expect(storage.load() == nil)
    }

    @Test func metricsFollowTheState() {
        #expect(KineticMetrics.forState(.moving).targetMin == 56)
        #expect(KineticMetrics.forState(.still).targetMin == 44)
    }
}
