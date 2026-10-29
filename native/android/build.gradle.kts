// Every plugin is declared here once (apply false) so that all modules share one class loader;
// declaring them per module makes AGP and the Kotlin plugin load twice and fail.
// This also resolves AGP on machines without an Android SDK, which is harmless: nothing applies it.
plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
}
