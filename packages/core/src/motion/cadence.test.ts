import { describe, expect, it } from 'vitest';
import { createCadenceEstimator } from './cadence';
import { DEFAULT_MOTION_CONFIG as config } from './config';
import { generateWalkingSamples } from './sources/simulator';

function estimate(cadence: number, durationMs = 10000, sampleRateHz = 50) {
  const estimator = createCadenceEstimator(config);
  for (const s of generateWalkingSamples({ cadence, durationMs, sampleRateHz })) {
    if (s.kind === 'acceleration') estimator.push(s);
  }
  return { estimator, end: durationMs };
}

describe('createCadenceEstimator', () => {
  it('measures 1.8 steps/s within tolerance', () => {
    const { estimator, end } = estimate(1.8);
    expect(Math.abs(estimator.cadence(end) - 1.8)).toBeLessThanOrEqual(0.15);
  });

  it.each([1.5, 2.4])('keeps %s steps/s inside the walking band', (cadence) => {
    const { estimator, end } = estimate(cadence);
    const measured = estimator.cadence(end);
    expect(measured).toBeGreaterThanOrEqual(config.minCadence);
    expect(measured).toBeLessThanOrEqual(config.maxCadence);
  });

  it('reports 0 for a still phone', () => {
    const { estimator, end } = estimate(0);
    expect(estimator.cadence(end)).toBe(0);
  });

  it('reports shaking (4 steps/s) as out of band', () => {
    const { estimator, end } = estimate(4, 10000, 100);
    expect(estimator.cadence(end)).toBeGreaterThan(config.maxCadence);
  });

  it('drops to 0 shortly after samples stop', () => {
    const { estimator, end } = estimate(1.8);
    expect(estimator.cadence(end)).toBeGreaterThan(0);
    expect(estimator.cadence(end + 2000)).toBe(0);
  });

  it('reset clears everything', () => {
    const { estimator, end } = estimate(1.8);
    estimator.reset();
    expect(estimator.cadence(end)).toBe(0);
  });
});
