import type { Scheduler } from './types';

/** Manually advanced clock + scheduler for deterministic tests. */
export function createFakeClock(start = 1000) {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; ms: number; due: number }>();

  const scheduler: Scheduler = {
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, ms, due: time + ms });
      return id;
    },
    clearInterval(handle) {
      timers.delete(handle as number);
    },
  };

  return {
    scheduler,
    now: () => time,
    /** Moves time forward, firing due timers in order. */
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        let next: { fn: () => void; ms: number; due: number } | undefined;
        for (const timer of timers.values()) if (timer.due <= end && (!next || timer.due < next.due)) next = timer;
        if (!next) break;
        time = next.due;
        next.due += next.ms;
        next.fn();
      }
      time = end;
    },
  };
}
