import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Compiles the generated UniFFI Kotlin and runs it against the HOST build of
// kinetic-ffi (`cargo build -p kinetic-ffi --release`). No Android SDK needed.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
    // One source of truth: the generated file is compiled in place, never copied.
    sourceSets.named("main") {
        kotlin.srcDir("../../generated/kotlin")
        // The library's platform-neutral half (MotionStore, sources that need no Android APIs) is
        // compiled here too, so its logic runs on the JVM against the real Rust engine.
        kotlin.srcDir("../kinetic/src/main/kotlin")
        kotlin.exclude(
            "**/FormStore.kt",
            "**/AccelerometerSource.kt",
            "**/ActivityTransitionSource.kt",
            "**/compose/**",
        )
    }
}

dependencies {
    implementation(libs.jna)
    implementation(libs.coroutines.core)
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

val repoRoot = layout.projectDirectory.dir("../../..").asFile.canonicalFile
val hostLibrary = run {
    val os = System.getProperty("os.name").lowercase()
    val name = when {
        "mac" in os -> "libkinetic_ffi.dylib"
        "win" in os -> "kinetic_ffi.dll"
        else -> "libkinetic_ffi.so"
    }
    File(repoRoot, "target/release/$name")
}

tasks.test {
    useJUnitPlatform()
    // The generated bindings load the library named by this property (see findLibraryName).
    systemProperty("uniffi.component.kinetic.libraryOverride", hostLibrary.absolutePath)
    doFirst {
        check(hostLibrary.isFile) {
            "Host library not found: $hostLibrary\nBuild it first: cargo build -p kinetic-ffi --release"
        }
    }
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
