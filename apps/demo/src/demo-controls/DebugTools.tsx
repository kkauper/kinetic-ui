import { useRef, useState } from 'react';
import { Button, Slider } from '@radix-ui/themes';
import { formModel, showFull, simulatorSource } from '../stores';
import { useThumbA11y } from '../ui/useThumbA11y';
import { switchSource } from './switchSource';

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
