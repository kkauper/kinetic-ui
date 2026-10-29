package co.kauper.kineticui.demo

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The stepper end to end on the JVM: focus follows the step, one text field keeps its identity from
 * step to step, and the summary lists every question. Needs the host build of the Rust library
 * (`cargo build -p kinetic-ffi --release`). Real keyboard and TalkBack behaviour still needs a device.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class StepperFlowTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private val textField get() = rule.onNode(hasSetTextAction())

    @Test
    @Config(sdk = [35], qualifiers = "w360dp-h480dp")
    fun summaryHeadingStaysVisibleOnASmallScreen() {
        rule.onNodeWithText("Simulate walking").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 1 of 5").fetchSemanticsNodes().isNotEmpty() }
        textField.performTextInput("a@example.com")
        rule.onNodeWithText("Next").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 2 of 5").fetchSemanticsNodes().isNotEmpty() }
        textField.performTextInput("Kai")
        rule.onNodeWithText("Next").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 3 of 5").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Search engine").performClick()
        rule.mainClock.advanceTimeBy(600)
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 4 of 5").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Yes").performClick()
        rule.mainClock.advanceTimeBy(600)
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 5 of 5").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Next").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Review your answers").fetchSemanticsNodes().isNotEmpty() }
        rule.mainClock.advanceTimeBy(500)
        rule.onNodeWithText("Review your answers").assertIsDisplayed().assertIsFocused()
    }

    @Test
    fun focusFollowsStepsAndSummaryListsEverything() {
        rule.onNodeWithText("Simulate walking").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 1 of 5").fetchSemanticsNodes().isNotEmpty() }

        // Step 1: the email field has focus without a tap.
        textField.assertIsFocused()
        val fieldId = textField.fetchSemanticsNode().id

        // Type, then press Next with a real touch: the same field node stays focused and now asks for the first name.
        textField.performTextInput("Kai@Example.COM")
        rule.onNodeWithText("Next").performTouchInput { click() }
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 2 of 5").fetchSemanticsNodes().isNotEmpty() }
        rule.onNode(hasSetTextAction() and hasText("First name")).assertIsFocused()
        assertEquals("same text field node", fieldId, textField.fetchSemanticsNode().id)

        textField.performTextInput("Kai")
        rule.onNodeWithText("Next").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 3 of 5").fetchSemanticsNodes().isNotEmpty() }

        // Choice: the first card takes focus; selecting advances after 300 ms.
        rule.onNodeWithText("Search engine").assertIsFocused()
        rule.onNodeWithText("Search engine").performClick()
        rule.mainClock.advanceTimeBy(600)
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 4 of 5").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Yes").performClick()
        rule.mainClock.advanceTimeBy(600)
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Question 5 of 5").fetchSemanticsNodes().isNotEmpty() }
        rule.onNode(hasContentDescription("How often", substring = true)).assertIsFocused()
        rule.onNodeWithText("Next").performClick()

        // Summary: heading, five rows with a Change pill each, the Create account pill.
        rule.waitUntil(5_000) { rule.onAllNodesWithText("Review your answers").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Review: 5 of 5 answered").assertExists()
        rule.onNodeWithText("Kai@example.com").assertExists()
        assertEquals(5, rule.onAllNodes(hasContentDescription("Change: ", substring = true)).fetchSemanticsNodes().size)
        rule.onNodeWithText("Create account").assertExists()
    }
}
