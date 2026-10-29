package co.kauper.kineticui

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import uniffi.kinetic.Sample

/**
 * The raw accelerometer, fed to the engine's step detector. `TYPE_ACCELEROMETER` already includes
 * gravity in m/s^2, which is what [Sample.Acceleration] expects. Needs no permission, so it is the
 * fallback on devices without Google Play services (where [ActivityTransitionSource] is unavailable).
 *
 * Sensor callbacks run on a private [HandlerThread] so a busy main thread cannot distort timing.
 */
class AccelerometerSource(context: Context) : MotionSource {
    override val id: String = "accelerometer"

    private val sensorManager = context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val lock = Any()
    private var listener: SensorEventListener? = null
    private var thread: HandlerThread? = null

    override suspend fun start(now: Now, emit: (Sample) -> Unit) {
        val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            ?: throw KineticSourceException("This device has no accelerometer, so walking mode can't work here.")
        synchronized(lock) {
            if (listener != null) return
            val handlerThread = HandlerThread("kinetic-accelerometer").also { it.start() }
            val sensorListener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) {
                    val v = event.values
                    emit(Sample.Acceleration(now.ms(), v[0].toDouble(), v[1].toDouble(), v[2].toDouble()))
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
            }
            val registered = sensorManager.registerListener(
                sensorListener,
                sensor,
                SensorManager.SENSOR_DELAY_GAME,
                Handler(handlerThread.looper),
            )
            if (!registered) {
                handlerThread.quitSafely()
                throw KineticSourceException("The accelerometer could not be started.")
            }
            thread = handlerThread
            listener = sensorListener
        }
    }

    override fun stop() {
        synchronized(lock) {
            listener?.let { sensorManager.unregisterListener(it) }
            listener = null
            thread?.quitSafely()
            thread = null
        }
    }
}
