import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Android library: the generated UniFFI Kotlin, the Android motion sources, the stores and the
// Compose bindings. AGP 9 compiles Kotlin itself ("built-in Kotlin"), so org.jetbrains.kotlin.android
// is NOT applied; only the Compose compiler plugin is.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "co.kauper.kineticui"
    compileSdk = 37

    defaultConfig {
        minSdk = 26
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    sourceSets {
        getByName("main") {
            // One source of truth, compiled in place (never copied):
            //  - the UniFFI Kotlin generated from crates/kinetic-ffi (package uniffi.kinetic),
            //  - the design tokens generated from packages/spec (package ui.kinetic.tokens).
            kotlin.directories.add("../../generated/kotlin")
            kotlin.directories.add("../../../packages/spec/generated")
        }
    }

    testOptions {
        unitTests.all { it.useJUnitPlatform() }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // JNA is what UniFFI's Kotlin uses to call the Rust library; the aar carries its Android natives.
    api("net.java.dev.jna:jna:${libs.versions.jna.get()}@aar")
    implementation(libs.coroutines.android)
    implementation(libs.play.services.location)
    implementation(libs.androidx.core.ktx)

    val bom = platform(libs.compose.bom)
    api(bom)
    api(libs.compose.ui)
    api(libs.compose.foundation)
    api(libs.compose.material3)
    api(libs.androidx.lifecycle.runtime.compose)

    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}
