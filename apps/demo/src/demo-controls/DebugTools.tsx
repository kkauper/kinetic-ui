import { useRef, useState } from 'react';
import { Slider, TextField } from '@radix-ui/themes';
import { formModel, motionStore, showFull, simulatorSource } from '../stores';
import { Pill } from '../ui/Pill';
import { useThumbA11y } from '../ui/useThumbA11y';
import { switchSource } from './switchSource';

type Band = 'minCadence' | 'maxCadence';

/** Whether `text` is a number that keeps the band non-empty once applied to `key`. */
function parseBand(key: Band, text: string): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  const { minCadence, maxCadence } = motionStore.config;
  return (key === 'minCadence' ? value < maxCadence : value > minCadence) ? value : null;
}

/** One cadence-band bound. Invalid input (NaN, min >= max) stays in the field but is not applied. */
function BandInput({ band, label }: { band: Band; label: string }) {
  const [text, setText] = useState(String(motionStore.config[band]));
  const invalid = parseBand(band, text) === null;
  const id = `debug-${band}`;
  return (
    <div className="k-debug-tools__field">
      <label htmlFor={id}>{label}</label>
      <TextField.Root
        id={id}
        type="number"
        inputMode="decimal"
        step={0.1}
        size="3"
        value={text}
        color={invalid ? 'red' : undefined}
        aria-invalid={invalid}
        onChange={(event) => {
          setText(event.target.value);
          const value = parseBand(band, event.target.value);
          if (value !== null) motionStore.configure({ [band]: value });
        }}
      />
    </div>
  );
}

type Delay = 'enterMovingAfterMs' | 'exitMovingAfterMs';

const MIN_DELAY_S = 0.5;
const MAX_DELAY_S = 30;

/** Seconds in 0.5..30 as milliseconds, or null for anything else. */
function parseDelay(text: string): number | null {
  const seconds = Number.parseFloat(text);
  return Number.isFinite(seconds) && seconds >= MIN_DELAY_S && seconds <= MAX_DELAY_S ? Math.round(seconds * 1000) : null;
}

/** One hysteresis delay in seconds. Invalid input stays in the field but is not applied. */
function DelayInput({ field, label }: { field: Delay; label: string }) {
  const [text, setText] = useState(String(motionStore.config[field] / 1000));
  const invalid = parseDelay(text) === null;
  const id = `debug-${field}`;
  return (
    <div className="k-debug-tools__field">
      <label htmlFor={id}>{label}</label>
      <TextField.Root
        id={id}
        type="number"
        inputMode="decimal"
        step={0.5}
        min={MIN_DELAY_S}
        max={MAX_DELAY_S}
        size="3"
        value={text}
        color={invalid ? 'red' : undefined}
        aria-invalid={invalid}
        onChange={(event) => {
          setText(event.target.value);
          const ms = parseDelay(event.target.value);
          if (ms !== null) motionStore.configure({ [field]: ms });
        }}
      />
    </div>
  );
}

/** Desktop tuning tools, all directly visible inside the debug sheet. */
export function DebugTools() {
  const [cadence, setCadence] = useState(1.8);
  const sliderRef = useRef<HTMLSpanElement>(null);
  useThumbA11y(sliderRef, {
    'aria-labelledby': 'debug-cadence-label',
    'aria-valuetext': `${cadence.toFixed(1)} steps per second`,
  });

  return (
    <>
      <section className="k-sheet__section" aria-labelledby="debug-sim-heading">
        <h3 id="debug-sim-heading" className="k-sheet__heading">Simulator</h3>
        <div id="debug-cadence-label">Simulated steps: {cadence.toFixed(1)} per second</div>
        <Slider
          ref={sliderRef}
          size="2"
          min={0}
          max={3}
          step={0.1}
          value={[cadence]}
          onValueChange={([next]) => {
            setCadence(next!);
            simulatorSource.setCadence(next!);
          }}
        />
        <div>
          <Pill
            type="button"
            size="3"
            variant="soft"
            onClick={() => {
              simulatorSource.setCadence(cadence);
              void switchSource(simulatorSource);
            }}
          >
            Use simulator
          </Pill>
        </div>
      </section>
      <section className="k-sheet__section" aria-labelledby="debug-band-heading">
        <h3 id="debug-band-heading" className="k-sheet__heading">Walking band (steps per second)</h3>
        <div className="k-debug-tools__bands">
          <BandInput band="minCadence" label="Min cadence" />
          <BandInput band="maxCadence" label="Max cadence" />
        </div>
      </section>
      <section className="k-sheet__section" aria-labelledby="debug-delay-heading">
        <h3 id="debug-delay-heading" className="k-sheet__heading">Switch delays (seconds, 0.5 to 30)</h3>
        <div className="k-debug-tools__bands">
          <DelayInput field="enterMovingAfterMs" label="Enter after (s)" />
          <DelayInput field="exitMovingAfterMs" label="Leave after (s)" />
        </div>
      </section>
      <section className="k-sheet__section" aria-labelledby="debug-reset-heading">
        <h3 id="debug-reset-heading" className="k-sheet__heading">Reset</h3>
        <div className="k-debug-tools__buttons">
          <Pill type="button" size="3" variant="soft" color="gray" onClick={() => showFull.resetSession()}>
            Reset Show-full session
          </Pill>
          <Pill type="button" size="3" variant="soft" color="red" onClick={() => formModel.reset()}>
            Clear saved answers
          </Pill>
        </div>
      </section>
    </>
  );
}
