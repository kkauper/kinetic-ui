import Testing
@testable import KineticUI

struct ActivityMappingTests {
    @Test func priorityIsAutomotiveCyclingRunningWalkingStationaryUnknown() {
        let all = ActivityFlags(stationary: true, walking: true, running: true, automotive: true, cycling: true, unknown: true)
        #expect(ActivityMapping.kind(for: all) == .automotive)

        var flags = all
        flags.automotive = false
        #expect(ActivityMapping.kind(for: flags) == .cycling)
        flags.cycling = false
        #expect(ActivityMapping.kind(for: flags) == .running)
        flags.running = false
        #expect(ActivityMapping.kind(for: flags) == .walking)
        flags.walking = false
        #expect(ActivityMapping.kind(for: flags) == .stationary)
        flags.stationary = false
        #expect(ActivityMapping.kind(for: flags) == .unknown)
        #expect(ActivityMapping.kind(for: ActivityFlags()) == .unknown)
    }

    @Test func walkingOnATrainIsNotWalking() {
        #expect(ActivityMapping.kind(for: ActivityFlags(walking: true, automotive: true)) == .automotive)
    }

    @Test func confidenceValues() {
        #expect(ActivityMapping.confidence(.low) == 0.33)
        #expect(ActivityMapping.confidence(.medium) == 0.67)
        #expect(ActivityMapping.confidence(.high) == 1.0)
    }
}
