import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { Dialog, Switch } from '@radix-ui/themes';
import { CloseIcon } from '../layout/icons';
import { Readout } from './DebugOverlay';
import { DebugInput } from './DebugInput';
import { DebugSensor } from './DebugSensor';
import { DebugTools } from './DebugTools';
import { debugUi, useDebugUi } from './debugUi';

const CLOSE_DISTANCE = 80;
const CLOSE_VELOCITY = 0.6; // px per ms: a quick flick down closes even when short
const NO_DRAG = 'input, button, [role="slider"], .rt-SliderRoot, label';

/**
 * Bottom sheet on a Radix Themes Dialog (focus trap, aria-modal, Escape, backdrop).
 * Dragging the handle/header down follows the finger and closes past 80 px or on a flick.
 * Focus goes back to whatever opened it (the Debug tag or the status pill).
 */
export function DebugSheet() {
  const { isOpen, pinned } = useDebugUi();
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);

  function move(dy: number, animate: boolean) {
    const el = sheet.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 160ms ease-out' : 'none';
    el.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if ((event.target as Element).closest(NO_DRAG)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0 };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      d.dy = Math.max(0, event.clientY - d.y);
      move(d.dy, false);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d || d.id !== event.pointerId) return;
      const velocity = d.dy / Math.max(event.timeStamp - d.t, 1);
      if (d.dy > CLOSE_DISTANCE || (d.dy > 20 && velocity > CLOSE_VELOCITY)) debugUi.close();
      move(0, true);
    },
    onPointerCancel() {
      drag.current = null;
      move(0, true);
    },
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => (open ? undefined : debugUi.close())}>
      <Dialog.Content
        ref={sheet}
        className="k-sheet"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          debugUi.returnFocus();
        }}
      >
        <div className="k-sheet__top" {...handlers}>
          <div className="k-sheet__handle" aria-hidden="true" />
          <div className="k-sheet__header">
            <Dialog.Title as="h2" className="k-sheet__title">
              Debug
            </Dialog.Title>
            <Dialog.Close>
              <button type="button" className="k-icon-button" aria-label="Close debug">
                <CloseIcon />
              </button>
            </Dialog.Close>
          </div>
        </div>
        <div className="k-sheet__body">
          <section className="k-sheet__section" aria-labelledby="debug-readout-heading">
            <h3 id="debug-readout-heading" className="k-sheet__heading">Live readout</h3>
            <Readout />
            <label className="k-sheet__switch">
              <Switch size="3" checked={pinned} onCheckedChange={(on) => debugUi.setPinned(on)} />
              Keep readout on screen
            </label>
          </section>
          <DebugInput />
          <DebugSensor />
          <DebugTools />
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
