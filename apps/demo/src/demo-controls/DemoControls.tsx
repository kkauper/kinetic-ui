import { useState } from 'react';
import { Switch } from '@radix-ui/themes';
import { manualSource } from '../stores';
import { useUiSize } from '../ui/useUiSize';

/**
 * Stands in for an input device (a phone's motion sensor). It is the only
 * place that touches a motion source; UI components just read the motion state.
 */
export function DemoControls() {
  const { controlSize } = useUiSize();
  const [walking, setWalking] = useState(manualSource.get() === 'moving');

  return (
    <section className="k-demo-controls" aria-labelledby="demo-controls-title">
      <h2 id="demo-controls-title" className="k-demo-controls__title">
        Demo controls
      </h2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--k-target-min)' }}>
        <Switch
          size={controlSize}
          checked={walking}
          onCheckedChange={(checked) => {
            setWalking(checked);
            manualSource.set(checked ? 'moving' : 'still');
          }}
        />
        Simulate walking
      </label>
    </section>
  );
}
