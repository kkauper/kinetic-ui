import { describe, expect, it } from 'vitest';
import { DEFAULT_MOTION_CONFIG as config } from './config';
import { initialMachine, isWalkingActivity, isWalkingCadence, stepMachine } from './machine';

/** Feeds `walking` once per second from `from` to `to` (inclusive). */
function run(m: ReturnType<typeof initialMachine>, walking: boolean, from: number, to: number) {
  let state = m;
  for (let t = from; t <= to; t += 1000) state = stepMachine(state, { now: t, walking }, config);
  return state;
}

describe('stepMachine', () => {
  it('enters moving only after the enter delay of sustained walking', () => {
    const enter = config.enterMovingAfterMs;
    let m = initialMachine(0);
    m = stepMachine(m, { now: 0, walking: true }, config);
    m = stepMachine(m, { now: enter - 1, walking: true }, config);
    expect(m.state).toBe('still');
    expect(m.pending).toBe('moving');
    m = stepMachine(m, { now: enter, walking: true }, config);
    expect(m.state).toBe('moving');
    expect(m.enteredAt).toBe(enter);
    expect(m.pending).toBeNull();
  });

  it('does not enter moving after a 2s walk', () => {
    let m = run(initialMachine(0), true, 0, 2000);
    m = run(m, false, 3000, 20000);
    expect(m.state).toBe('still');
    expect(m.pending).toBeNull();
  });

  it('restarts the clock after a brief interruption', () => {
    const enter = config.enterMovingAfterMs;
    let m = stepMachine(initialMachine(0), { now: 0, walking: true }, config);
    m = stepMachine(m, { now: 1000, walking: false }, config);
    m = stepMachine(m, { now: 2000, walking: true }, config);
    m = stepMachine(m, { now: 2000 + enter - 1, walking: true }, config);
    expect(m.state).toBe('still');
    m = stepMachine(m, { now: 2000 + enter, walking: true }, config);
    expect(m.state).toBe('moving');
  });

  it('exits moving only after 10s of non-walking', () => {
    let m = run(initialMachine(0), true, 0, config.enterMovingAfterMs);
    expect(m.state).toBe('moving');
    m = run(m, false, 6000, 6000 + config.exitMovingAfterMs - 1000);
    expect(m.state).toBe('moving');
    m = run(m, false, 6000 + config.exitMovingAfterMs, 6000 + config.exitMovingAfterMs);
    expect(m.state).toBe('still');
  });

  it('survives a 4s pause while moving', () => {
    let m = run(initialMachine(0), true, 0, config.enterMovingAfterMs);
    m = run(m, false, 6000, 9000);
    m = run(m, true, 10000, 20000);
    expect(m.state).toBe('moving');
    expect(m.pending).toBeNull();
  });

  it('returns the same reference when nothing changes', () => {
    const m = initialMachine(0);
    expect(stepMachine(m, { now: 100, walking: false }, config)).toBe(m);
    const moving = stepMachine(stepMachine(m, { now: 0, walking: true }, config), { now: config.enterMovingAfterMs, walking: true }, config);
    expect(moving.state).toBe('moving');
    expect(stepMachine(moving, { now: moving.enteredAt + 100, walking: true }, config)).toBe(moving);
  });

  it('keeps progress while pending (a lean is tracked, so the reference changes)', () => {
    const pending = stepMachine(initialMachine(0), { now: 100, walking: true }, config);
    expect(stepMachine(pending, { now: 600, walking: true }, config)).toMatchObject({ pending: 'moving', progressMs: 500 });
  });
});

describe('isWalkingCadence', () => {
  it('is inclusive at both ends', () => {
    expect(isWalkingCadence(1.5, config)).toBe(true);
    expect(isWalkingCadence(2.5, config)).toBe(true);
    expect(isWalkingCadence(1.4, config)).toBe(false);
    expect(isWalkingCadence(2.6, config)).toBe(false);
  });
});

describe('isWalkingActivity', () => {
  it('needs a listed activity with enough confidence', () => {
    expect(isWalkingActivity('walking', 1, config)).toBe(true);
    expect(isWalkingActivity('walking', 0.5, config)).toBe(true);
    expect(isWalkingActivity('walking', 0.49, config)).toBe(false);
    expect(isWalkingActivity('running', 1, config)).toBe(false);
    expect(isWalkingActivity('running', 1, { ...config, movingActivities: ['walking', 'running'] })).toBe(true);
  });
});
