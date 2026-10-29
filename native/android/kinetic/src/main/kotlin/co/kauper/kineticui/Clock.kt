package co.kauper.kineticui

/**
 * The one clock of the library, in milliseconds. Sample timestamps and the engine's `now` must come
 * from the same clock; sources and [MotionStore] receive it instead of reading the system clock.
 */
fun interface Now {
    fun ms(): Double
}

/** Wall-clock time. Only differences matter to the engine, so the epoch is irrelevant. */
object SystemNow : Now {
    override fun ms(): Double = System.currentTimeMillis().toDouble()
}
