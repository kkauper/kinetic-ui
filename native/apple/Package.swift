// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KineticUI",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KineticUI", targets: ["KineticUI"]),
    ],
    targets: [
        // The Rust core as a static-library XCFramework; built by scripts/build-xcframework.sh.
        .binaryTarget(name: "KineticFFI", path: "KineticFFI.xcframework"),

        // UniFFI-generated Swift (committed so the package reads without a build).
        .target(
            name: "KineticBindings",
            dependencies: ["KineticFFI"],
            // Generated code, not ours to fix: it predates Swift 6 strict
            // concurrency (global mutable state, unchecked Sendable), so this
            // target alone stays in Swift 5 mode.
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),

        // Stores, motion sources and SwiftUI environment. Swift 6 mode.
        .target(
            name: "KineticUI",
            dependencies: ["KineticBindings"]
        ),
        .testTarget(
            name: "KineticUITests",
            dependencies: ["KineticUI"]
        ),
    ]
)
