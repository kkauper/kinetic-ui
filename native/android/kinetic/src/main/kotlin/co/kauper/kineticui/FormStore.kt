package co.kauper.kineticui

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.kinetic.AnswerValue
import uniffi.kinetic.ChangeListener
import uniffi.kinetic.FieldSchema
import uniffi.kinetic.FormModel
import uniffi.kinetic.FormState
import uniffi.kinetic.FormStorage
import uniffi.kinetic.Subscription
import uniffi.kinetic.signupSchemaJson

/**
 * The Rust [FormModel] as a [StateFlow]. Actions forward to the model; every change in the model
 * refreshes [state]. Throws [uniffi.kinetic.KineticException] from the constructor for an invalid
 * schema and from [setAnswer] / [isAnswered] for an unknown field id.
 *
 * @param storage where answers survive restarts; null keeps them in memory only.
 * @param schemaJson the form schema; defaults to the sign-up form shared with the web demo.
 */
class FormStore(
    storage: FormStorage? = null,
    schemaJson: String = signupSchemaJson(),
) : AutoCloseable {
    private val model = FormModel(schemaJson, storage)
    private val lock = Any()
    private val _state = MutableStateFlow(model.state())

    /** Answers, current step, deferred ids and validation errors. */
    val state: StateFlow<FormState> = _state.asStateFlow()

    /** The form title. */
    val title: String = model.title()

    /** The questions in order. */
    val fields: List<FieldSchema> = model.fields()

    private val subscription: Subscription = model.subscribe(
        object : ChangeListener {
            override fun onChange() {
                synchronized(lock) { _state.value = model.state() }
            }
        },
    )

    fun setAnswer(id: String, value: AnswerValue?) = model.setAnswer(id, value)

    /** Validates the current field; advances and returns true on success. */
    fun next(): Boolean = model.next()

    fun back() = model.back()

    fun goTo(step: Int) = model.goTo(step)

    /** Postpones a deferrable field (default: the current one). */
    fun defer(id: String? = null): Boolean = model.defer(id)

    fun jumpToFirstUnanswered() = model.jumpToFirstUnanswered()

    /** Validates every field; true if there are no errors. */
    fun validateAll(): Boolean = model.validateAll()

    /** Clears answers and stored data and returns to the first step. */
    fun reset() = model.reset()

    fun isAnswered(id: String): Boolean = model.isAnswered(id)

    /** Deferred ids that are still unanswered. */
    fun pendingDeferred(): List<String> = model.pendingDeferred()

    override fun close() {
        subscription.cancel()
        subscription.close()
        model.close()
    }
}

/**
 * [FormStorage] on `SharedPreferences`. The value is the same JSON the web demo keeps in
 * `localStorage` under the same key. Storage failures are swallowed: the form then just starts
 * empty, as the contract of [FormStorage] asks.
 */
class SharedPreferencesFormStorage(
    private val preferences: SharedPreferences,
    private val key: String = DEFAULT_KEY,
) : FormStorage {
    constructor(context: Context, key: String = DEFAULT_KEY) :
        this(context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE), key)

    override fun load(): String? = runCatching { preferences.getString(key, null) }.getOrNull()

    override fun save(json: String) {
        runCatching { preferences.edit().putString(key, json).apply() }
    }

    override fun clear() {
        runCatching { preferences.edit().remove(key).apply() }
    }

    companion object {
        const val DEFAULT_KEY = "kinetic-ui:signup"
        private const val PREFERENCES_NAME = "kinetic-ui"
    }
}
