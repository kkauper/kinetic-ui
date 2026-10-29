import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "co.kauper.kineticui.demo"
    compileSdk = 37

    defaultConfig {
        applicationId = "co.kauper.kineticui.demo"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests {
            // Robolectric needs the merged resources and manifest of the app.
            isIncludeAndroidResources = true
        }
        unitTests.all {
            // The generated UniFFI bindings load the host build of the Rust library (cargo build -p kinetic-ffi --release).
            val lib = layout.projectDirectory.dir("../../../target/release").asFile
            val name = if (System.getProperty("os.name").lowercase().contains("mac")) "libkinetic_ffi.dylib" else "libkinetic_ffi.so"
            it.systemProperty("uniffi.component.kinetic.libraryOverride", File(lib, name).canonicalPath)
            // Optional: a folder with Robolectric's android-all jars, for machines that cannot reach Maven Central from the test JVM.
            System.getenv("ROBOLECTRIC_DEPENDENCY_DIR")?.let { dir ->
                it.systemProperty("robolectric.dependency.dir", dir)
                it.systemProperty("robolectric.offline", "true")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":kinetic"))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.coroutines.android)

    testImplementation(libs.junit4)
    testImplementation(libs.robolectric)
    // The host JNA jar (the AAR on the main classpath only carries Android natives).
    testImplementation("net.java.dev.jna:jna:${libs.versions.jna.get()}")
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(platform(libs.compose.bom))
    debugImplementation(libs.compose.ui.test.manifest)
}
