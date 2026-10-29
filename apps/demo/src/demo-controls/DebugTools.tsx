import { useRef, useState } from 'react';
import { Button, Slider, TextField } from '@radix-ui/themes';
import { formModel, motionStore, showFull, simulatorSource } from '../stores';
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
        step={0.1}
        size="1"
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

/** Desktop tuning tools, collapsed by default. Tooling, so fixed small Radix sizes. */
export function DebugTools() {
  const [cadence, setCadence] = useState(1.8);
  const sliderRef = useRef<HTMLSpanElement>(null);
  useThumbA11y(sliderRef, {
    'aria-labelledby': 'debug-cadence-label',
    'aria-valuetext': `${cadence.toFixed(1)} steps per second`,
  });

  return (
    <details className="k-debug-tools">
      <summary>Debug tools</summary>
      <div className="k-debug-tools__body">
        <div id="debug-cadence-label">Simulated steps: {cadence.toFixed(1)} per second</div>
        <Slider
          ref={sliderRef}
          size="1"
          min={0}
          max={3}
          step={0.1}
          value={[cadence]}
          onValueChange={([next]) => {
            setCadence(next!);
            simulatorSource.setCadence(next!);
          }}
        />
        <div className="k-debug-tools__bands">
          <BandInput band="minCadence" label="Min cadence" />
          <BandInput band="maxCadence" label="Max cadence" />
        </div>
        <div className="k-debug-tools__buttons">
          <Button
            type="button"
            size="1"
            variant="soft"
            onClick={() => {
              simulatorSource.setCadence(cadence);
              void switchSource(simulatorSource);
            }}
          >
            Use simulator
          </Button>
          <Button type="button" size="1" variant="soft" color="gray" onClick={() => showFull.resetSession()}>
            Reset Show-full session
          </Button>
          <Button type="button" size="1" variant="soft" color="red" onClick={() => formModel.reset()}>
            Clear saved answers
          </Button>
        </div>
      </div>
    </details>
  );
}
