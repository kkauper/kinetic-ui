package co.kauper.kineticui

import java.util.concurrent.atomic.AtomicInteger
import uniffi.kinetic.ActivityKind
import uniffi.kinetic.AnswerValue
import uniffi.kinetic.ChangeListener
import uniffi.kinetic.FormModel
import uniffi.kinetic.FormStorage
import uniffi.kinetic.MotionEngine
import uniffi.kinetic.MotionState
import uniffi.kinetic.Sample
import uniffi.kinetic.defaultConfig
import uniffi.kinetic.emailDomainCompletions
import uniffi.kinetic.normalizeEmail
import uniffi.kinetic.signupSchemaJson
import uniffi.kinetic.suggestEmailDomain
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.junit.jupiter.api.assertThrows
import java.util.concurrent.TimeUnit

/**
 * End-to-end checks of the generated Kotlin bindings against the real Rust
 * library (the host build). They prove that loading, records, enums, errors,
 * foreign callbacks (ChangeListener, FormStorage) and re-entrancy work through
 * JNA, without an emulator.
 */
class BindingsTest {
    private val config = defaultConfig()

    private fun walkingSample(t: Double) = Sample.Activity(t, ActivityKind.WALKING, 1.0)

    @Test
    fun `default config matches the TypeScript core`() {
        assertEquals(5000.0, config.enterMovingAfterMs)
        assertTrue(config.tickIntervalMs > 0)
        assertTrue(config.movingActivities.contains(ActivityKind.WALKING))
    }

    @Test
    fun `walking activity enters moving only after enterMovingAfterMs of ticks`() {
        val engine = MotionEngine(config, 0.0)
        engine.pushSample(walkingSample(0.0))

        engine.tick(config.enterMovingAfterMs - 1)
        assertEquals(MotionState.STILL, engine.snapshot().state)
        assertEquals(MotionState.MOVING, engine.snapshot().pending)

        engine.tick(config.enterMovingAfterMs)
        val snapshot = engine.snapshot()
        assertEquals(MotionState.MOVING, snapshot.state)
        assertEquals(MotionState.MOVING, snapshot.detected)
        assertNull(snapshot.forced)
        assertEquals(ActivityKind.WALKING, snapshot.activity)
    }

    @Test
    fun `explicit state sample is immediate`() {
        val engine = MotionEngine(config, 0.0)
        engine.pushSample(Sample.State(10.0, MotionState.MOVING))
        assertEquals(MotionState.MOVING, engine.snapshot().state)
        engine.pushSample(Sample.State(20.0, MotionState.STILL))
        assertEquals(MotionState.STILL, engine.snapshot().state)
    }

    @Test
    fun `force overrides and releases`() {
        val engine = MotionEngine(config, 0.0)
        engine.force(MotionState.MOVING, 1.0)
        assertEquals(MotionState.MOVING, engine.snapshot().state)
        assertEquals(MotionState.STILL, engine.snapshot().detected)
        engine.force(null, 2.0)
        assertEquals(MotionState.STILL, engine.snapshot().state)
    }

    @Test
    fun `show full tap suppresses moving until the user stops, then release`() {
        val engine = MotionEngine(config, 0.0)
        engine.pushSample(Sample.State(0.0, MotionState.MOVING))
        assertEquals(MotionState.MOVING, engine.snapshot().state)

        engine.showFull(100.0)
        assertEquals(MotionState.STILL, engine.snapshot().state)
        assertTrue(engine.showFullState().active)
        assertEquals(1u, engine.showFullState().taps)

        // The user stops: the episode ends and the override is released.
        engine.pushSample(Sample.State(200.0, MotionState.STILL))
        assertFalse(engine.showFullState().active)

        engine.resetShowFullSession(300.0)
        assertEquals(0u, engine.showFullState().taps)
        assertFalse(engine.showFullState().suppressed)
    }

    @Test
    fun `form model next defer and jump`() {
        val model = FormModel(signupSchemaJson(), null)
        assertEquals("Create your account", model.title())
        assertEquals(5, model.fields().size)

        // Required email blocks next and reports an error.
        assertFalse(model.next())
        assertNotNull(model.state().errors["email"])

        model.setAnswer("email", AnswerValue.Text("a@example.com"))
        assertTrue(model.next())
        assertEquals(1u, model.state().currentStep)

        // firstName is deferrable.
        assertTrue(model.defer(null))
        assertEquals(listOf("firstName"), model.state().deferred)
        assertEquals(listOf("firstName"), model.pendingDeferred())

        model.goTo(0)
        model.jumpToFirstUnanswered()
        assertEquals(2u, model.state().currentStep) // email answered, firstName deferred
        assertTrue(model.isAnswered("email"))
    }

    @Test
    fun `unknown field is a typed error`() {
        val model = FormModel(signupSchemaJson(), null)
        val error = assertThrows<uniffi.kinetic.KineticException.UnknownField> {
            model.setAnswer("nope", AnswerValue.Bool(true))
        }
        assertEquals("nope", error.id)
    }

    @Test
    fun `invalid schema is a typed error`() {
        assertThrows<uniffi.kinetic.KineticException.InvalidSchema> {
            FormModel("{ not json", null)
        }
    }

    private class MemoryStorage : FormStorage {
        var json: String? = null
        val saves = AtomicInteger()
        override fun load(): String? = json
        override fun save(json: String) {
            this.json = json
            saves.incrementAndGet()
        }
        override fun clear() {
            json = null
        }
    }

    @Test
    fun `form storage round trips through a Kotlin implementation`() {
        val storage = MemoryStorage()
        val first = FormModel(signupSchemaJson(), storage)
        first.setAnswer("email", AnswerValue.Text("a@example.com"))
        first.setAnswer("newsletter", AnswerValue.Bool(true))
        first.setAnswer("frequency", AnswerValue.Number(3.0))
        assertNotNull(storage.json)
        assertTrue(storage.saves.get() >= 3)

        val second = FormModel(signupSchemaJson(), storage)
        val answers = second.state().answers
        assertEquals(AnswerValue.Text("a@example.com"), answers["email"])
        assertEquals(AnswerValue.Bool(true), answers["newsletter"])
        assertEquals(AnswerValue.Number(3.0), answers["frequency"])

        second.reset()
        assertNull(storage.json)
    }

    @Test
    fun `listener counts calls and cancel stops them`() {
        val engine = MotionEngine(config, 0.0)
        val calls = AtomicInteger()
        val subscription = engine.subscribe(object : ChangeListener {
            override fun onChange() {
                calls.incrementAndGet()
            }
        })
        engine.pushSample(Sample.State(1.0, MotionState.MOVING))
        assertEquals(1, calls.get())
        engine.pushSample(Sample.State(2.0, MotionState.MOVING)) // no change
        assertEquals(1, calls.get())
        subscription.cancel()
        engine.pushSample(Sample.State(3.0, MotionState.STILL))
        assertEquals(1, calls.get())
    }

    @Test
    @Timeout(value = 10, unit = TimeUnit.SECONDS)
    fun `re-entrant listener calling snapshot does not deadlock`() {
        val engine = MotionEngine(config, 0.0)
        var seen: MotionState? = null
        engine.subscribe(object : ChangeListener {
            override fun onChange() {
                seen = engine.snapshot().state
            }
        })
        engine.pushSample(Sample.State(1.0, MotionState.MOVING))
        assertEquals(MotionState.MOVING, seen)
    }

    @Test
    fun `email helpers`() {
        assertEquals("a@gmail.com", normalizeEmail("  a@GMAIL.com "))
        assertTrue(emailDomainCompletions("sam@").any { it.domain == "gmail.com" })
        val suggestion = suggestEmailDomain("sam@gmial.com")
        assertNotNull(suggestion)
        assertEquals("sam@gmail.com", suggestion!!.email)
        assertNull(suggestEmailDomain("sam@gmail.com"))
    }
}
