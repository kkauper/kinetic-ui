import { describe, expect, it, vi } from 'vitest';
import { createFakeClock } from './test-utils';
import { bindMotionAttribute } from './dom';
import { createMotionStore } from './store';
import { createManualSource } from './sources/manual';
import { createSimulatorSource } from './sources/simulator';
import type { MotionSample, MotionSource } from './types';

function setup() {
  const clock = createFakeClock();
  const simulator = createSimulatorSource({ scheduler: clock.scheduler, now: clock.now });
  const store = createMotionStore({ source: simulator, now: clock.now, scheduler: clock.scheduler });
  return { clock, simulator, store };
}

describe('simulator-driven store', () => {
  it('switches to moving after ~5s of walking and back after ~10s of stillness', async () => {
    const { clock, simulator, store } = setup();
    simulator.setCadence(1.8);
    await store.start();
    clock.advance(4000);
    expect(store.getState().state).toBe('still');
    clock.advance(3000);
    expect(store.getState().state).toBe('moving');
    expect(store.getState().cadence).toBeGreaterThanOrEqual(1.5);

    simulator.setCadence(0);
    clock.advance(8000);
    expect(store.getState().state).toBe('moving');
    clock.advance(6000);
    expect(store.getState().state).toBe('still');
  });

  it('does not emit on ticks that change nothing', async () => {
    const { clock, store } = setup();
    await store.start();
    clock.advance(3000);
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    clock.advance(3000);
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stop resets to still and keeps the forced state', async () => {
    const { clock, simulator, store } = setup();
    simulator.setCadence(1.8);
    await store.start();
    clock.advance(8000);
    expect(store.getState().detected).toBe('moving');
    store.force('moving');
    store.stop();
    expect(store.getState()).toMatchObject({ detected: 'still', forced: 'moving', state: 'moving', running: false });
  });

  it('setSource while running swaps sources', async () => {
    const { clock, store } = setup();
    await store.start();
    const manual = createManualSource('moving');
    await store.setSource(manual);
    expect(store.getState()).toMatchObject({ source: 'manual', running: true, state: 'moving' });
    manual.set('still');
    expect(store.getState().state).toBe('still');
    clock.advance(20000);
    expect(store.getState().state).toBe('still');
  });
});

describe('manual source', () => {
  it('switches immediately and is stable over time', async () => {
    const clock = createFakeClock();
    const manual = createManualSource();
    const store = createMotionStore({ source: manual, now: clock.now, scheduler: clock.scheduler });
    await store.start();
    manual.set('moving');
    expect(store.getState().state).toBe('moving');
    clock.advance(60000);
    expect(store.getState().state).toBe('moving');
  });
});

describe('force', () => {
  it('overrides, updates enteredAt, and restores detected on null', async () => {
    const clock = createFakeClock();
    const manual = createManualSource();
    const store = createMotionStore({ source: manual, now: clock.now, scheduler: clock.scheduler });
    await store.start();
    clock.advance(1000);
    const t0 = clock.now();
    store.force('moving');
    expect(store.getState()).toMatchObject({ state: 'moving', detected: 'still', forced: 'moving', enteredAt: t0 });
    clock.advance(1000);
    store.force(null);
    expect(store.getState()).toMatchObject({ state: 'still', forced: null, enteredAt: clock.now() });
  });

  it('is a no-op when repeated', () => {
    const store = createMotionStore();
    store.force('still');
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.force('still');
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('subscriptions', () => {
  it('stops notifying after unsubscribe', () => {
    const store = createMotionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.force('moving');
    unsubscribe();
    store.force('still');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('failing and stale sources', () => {
  it('records the error, stays not running, and rejects', async () => {
    const failing: MotionSource = {
      id: 'broken',
      start: () => Promise.reject(new Error('Permission denied')),
      stop: () => {},
    };
    const store = createMotionStore({ source: failing });
    await expect(store.start()).rejects.toThrow('Permission denied');
    expect(store.getState()).toMatchObject({ running: false, error: 'Permission denied' });
  });

  it('ignores a start that resolves after stop()', async () => {
    let release: () => void = () => {};
    let emit: (s: MotionSample) => void = () => {};
    const stop = vi.fn();
    const slow: MotionSource = {
      id: 'slow',
      start(e) {
        emit = e;
        return new Promise<void>((resolve) => (release = resolve));
      },
      stop,
    };
    const store = createMotionStore({ source: slow });
    const started = store.start();
    store.stop();
    release();
    await started;
    expect(store.getState().running).toBe(false);
    emit({ kind: 'state', t: 0, state: 'moving' });
    expect(store.getState().detected).toBe('still');
  });
});

describe('bindMotionAttribute', () => {
  it('sets immediately and only on state changes', () => {
    const store = createMotionStore();
    const target = { setAttribute: vi.fn() };
    const unbind = bindMotionAttribute(store, target);
    expect(target.setAttribute).toHaveBeenLastCalledWith('data-motion', 'still');
    store.force('moving');
    expect(target.setAttribute).toHaveBeenLastCalledWith('data-motion', 'moving');
    const calls = target.setAttribute.mock.calls.length;
    store.force(null);
    store.force('moving');
    expect(target.setAttribute.mock.calls.length).toBe(calls + 2);
    unbind();
    store.force('still');
    expect(target.setAttribute.mock.calls.length).toBe(calls + 2);
  });
});
