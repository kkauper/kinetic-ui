package co.kauper.kineticui.demo

import android.app.Application
import co.kauper.kineticui.AccelerometerSource
import co.kauper.kineticui.ActivityTransitionSource
import co.kauper.kineticui.FormStore
import co.kauper.kineticui.ManualSource
import co.kauper.kineticui.MotionStore
import co.kauper.kineticui.SharedPreferencesFormStorage
import co.kauper.kineticui.SimulatedWalkSource
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

/** App-wide singletons, the Android counterpart of the web demo's `stores.ts`. */
class DemoGraph(application: Application) {
    val form = FormStore(storage = SharedPreferencesFormStorage(application))

    /** A switch on screen; needs no permission, so the store can start with it right away. */
    val manualSource = ManualSource()

    /** Synthetic steps for an emulator. */
    val simulatedSource = SimulatedWalkSource()

    val accelerometerSource = AccelerometerSource(application)

    /** The OS activity classifier (Play services); needs the ACTIVITY_RECOGNITION permission. */
    val transitionSource = ActivityTransitionSource(application)

    val motion = MotionStore(source = manualSource)

    /** State of the Debug sheet and the pinned readout. */
    val debugUi = DebugUi(application)

    init {
        MainScope().launch { motion.start() }
    }
}

class DemoApplication : Application() {
    lateinit var graph: DemoGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = DemoGraph(this)
    }
}
