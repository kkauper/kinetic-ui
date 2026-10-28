import { describe, expect, it } from 'vitest';
import { createFakeClock } from './test-utils';
import { createShowFullPolicy } from './show-full';
import { createMotionStore } from './store';
import { createSimulatorSource } from './sources/simulator';

async function setup() {
  const clock = createFakeClock();
  const simulator = createSimulatorSource({ scheduler: clock.scheduler, now: clock.now });
  const store = createMotionStore({ source: simulator, now: clock.now, scheduler: clock.scheduler });
  const policy = createShowFullPolicy(store);
  await store.start();
  const walkUntilMoving = () => {
    simulator.setCadence(1.8);
    clock.advance(8000);
  };
  const standStill = () => {
    simulator.setCadence(0);
    clock.advance(14000);
  };
  return { clock, store, policy, walkUntilMoving, standStill };
}

describe('show-full policy', () => {
  it('forces still on tap and releases once the user really stops', async () => {
    const { store, policy, walkUntilMoving, standStill } = await setup();
    walkUntilMoving();
    expect(store.getState().state).toBe('moving');
    policy.showFull();
    expect(store.getState()).toMatchObject({ state: 'still', forced: 'still' });
    expect(policy.getState()).toMatchObject({ active: true, taps: 1, suppressed: false });
    standStill();
    expect(store.getState().forced).toBeNull();
    expect(policy.getState().active).toBe(false);
    walkUntilMoving();
    expect(store.getState().state).toBe('moving');
  });

  it('suppresses moving mode after 3 taps', async () => {
    const { store, policy, walkUntilMoving, standStill } = await setup();
    for (let i = 0; i < 3; i++) {
      walkUntilMoving();
      policy.showFull();
      standStill();
    }
    expect(policy.getState()).toMatchObject({ taps: 3, suppressed: true });
    walkUntilMoving();
    expect(store.getState().detected).toBe('moving');
    expect(store.getState().state).toBe('still');
  });

  it('resetSession restores everything', async () => {
    const { store, policy, walkUntilMoving } = await setup();
    walkUntilMoving();
    for (let i = 0; i < 3; i++) policy.showFull();
    policy.resetSession();
    expect(policy.getState()).toEqual({ active: false, taps: 0, suppressed: false });
    expect(store.getState().forced).toBeNull();
    expect(store.getState().state).toBe('moving');
  });
});
