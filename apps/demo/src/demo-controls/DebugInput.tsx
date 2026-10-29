import { Switch } from '@radix-ui/themes';
import { Pill } from '../ui/Pill';
import { setManualWalking, toggleSensor, useInputState } from './inputControls';

/**
 * Both input devices, whatever the device: the tag row shows only the one that fits it
 * (phone: Walking mode, other devices: Simulate walking), developers may need the other.
 * Focus stays inside the sheet, so switching Simulate walking on does not jump to the stepper.
 */
export function DebugInput() {
  const { sensorRunning, manualWalking } = useInputState();
  return (
    <section className="k-sheet__section" aria-labelledby="debug-input-heading">
      <h3 id="debug-input-heading" className="k-sheet__heading">Input</h3>
      <label className="k-sheet__switch">
        <Switch
          size="3"
          checked={manualWalking}
          onCheckedChange={(on) => setManualWalking(on, { focusStepper: false })}
        />
        Simulate walking
      </label>
      <div>
        <Pill
          type="button"
          size="3"
          variant="soft"
          aria-pressed={sensorRunning}
          onClick={() => toggleSensor(sensorRunning)}
        >
          {sensorRunning ? 'Walking mode on' : 'Walking mode'}
        </Pill>
      </div>
    </section>
  );
}
