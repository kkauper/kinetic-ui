pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "kinetic-ui-android"

// `:bindings-test` is plain Kotlin/JVM: it needs no Android SDK, so it builds on any
// machine and in CI. `:kinetic` and `:demo` are Android modules and are included only
// when an Android SDK is configured (`sdk.dir` in local.properties, or ANDROID_HOME /
// ANDROID_SDK_ROOT). Without one, `./gradlew :bindings-test:test` still works.
val hasAndroidSdk: Boolean = run {
    val local = file("local.properties")
    val fromLocal = local.takeIf { it.isFile }
        ?.readLines()
        ?.any { it.trim().startsWith("sdk.dir=") && it.substringAfter('=').isNotBlank() }
        ?: false
    fromLocal || !System.getenv("ANDROID_HOME").isNullOrBlank() || !System.getenv("ANDROID_SDK_ROOT").isNullOrBlank()
}

include(":bindings-test")
if (hasAndroidSdk) {
    include(":kinetic", ":demo")
} else {
    logger.lifecycle("No Android SDK found: skipping :kinetic and :demo (only :bindings-test is available).")
}
