package co.kauper.kineticui.demo

/** A user-facing message for a source error. */
data class NoticeContent(val title: String, val body: String, val offerSimulate: Boolean = true)

/**
 * The one place that turns the motion sources' error strings into wording (the Android twin of the
 * web demo's `notices.ts`). Matching is on stable key phrases, so a reworded message falls through
 * to the generic notice instead of showing nothing.
 */
fun noticeForError(error: String): NoticeContent {
    val e = error.lowercase()
    return when {
        "play services" in e -> NoticeContent(
            "Google Play services is missing",
            "Walking mode needs it. Try the accelerometer in Debug, or use Simulate walking.",
        )
        "permission" in e || "not allowed" in e || "denied" in e -> NoticeContent(
            "Motion access was not allowed",
            "Allow Physical activity for this app in Settings and try again. Simulate walking works anywhere.",
        )
        "no accelerometer" in e -> NoticeContent(
            "This device doesn't report motion",
            "Try a phone. Simulate walking works anywhere.",
        )
        "could not be started" in e || "no motion data" in e -> NoticeContent(
            "No motion data received",
            "Try on a phone. Simulate walking works anywhere.",
        )
        else -> NoticeContent("Walking mode could not start", error)
    }
}
