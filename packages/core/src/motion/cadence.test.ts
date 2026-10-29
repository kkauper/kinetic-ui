import { describe, expect, it } from 'vitest';
import { createCadenceEstimator } from './cadence';
import { DEFAULT_MOTION_CONFIG as config } from './config';
import { generateWalkingSamples } from './sources/simulator';

function estimate(cadence: number, durationMs = 10000, sampleRateHz = 50, amplitude?: number) {
  const estimator = createCadenceEstimator(config);
  for (const s of generateWalkingSamples({ cadence, durationMs, sampleRateHz, amplitude })) {
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

  it.each([50, 60, 100])('reports shaking (4 steps/s) as out of band at %s Hz', (rate) => {
    const { estimator, end } = estimate(4, 10000, rate);
    expect(estimator.cadence(end)).toBeGreaterThanOrEqual(3.2);
  });

  it.each([50, 60])('measures 1.4, 1.8 and 2.4 steps/s at %s Hz', (rate) => {
    for (const cadence of [1.4, 1.8, 2.4]) {
      const { estimator, end } = estimate(cadence, 10000, rate);
      expect(Math.abs(estimator.cadence(end) - cadence)).toBeLessThanOrEqual(0.15);
    }
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

  it.each([0.6, 1.0])('measures a hand-held walk (bounce amplitude %s m/s^2)', (amplitude) => {
    const { estimator, end } = estimate(1.8, 8000, 60, amplitude);
    expect(Math.abs(estimator.cadence(end) - 1.8)).toBeLessThanOrEqual(0.15);
  });

  it('adapts the threshold to the bounce height but never below the floor', () => {
    const weak = estimate(1.8, 8000, 60, 0.6).estimator.diagnostics();
    const strong = estimate(1.8, 8000, 60, 3).estimator.diagnostics();
    expect(weak.threshold).toBe(config.stepThreshold);
    expect(strong.threshold).toBeGreaterThan(weak.threshold);
    expect(strong.envelope).toBeGreaterThan(weak.envelope);
  });

  it('reports 0 for steps at irregular intervals', () => {
    const estimator = createCadenceEstimator(config);
    // Bumps 0.5, 0.9, 0.3, 1.3, 0.4 s apart: enough steps, but not periodic.
    const bumps = [500, 1400, 1700, 3000, 3400, 3900];
    for (let t = 0; t <= 4500; t += 20) {
      const z = 9.81 + bumps.reduce((sum, b) => sum + 2 * Math.exp(-(((t - b) / 60) ** 2)), 0);
      estimator.push({ t, x: 0, y: 0, z });
    }
    expect(estimator.diagnostics().stepsInWindow).toBeGreaterThanOrEqual(config.minStepsForCadence);
    expect(estimator.diagnostics().intervalCv).toBeGreaterThan(0.3);
    expect(estimator.cadence(4500)).toBe(0);
  });

  it('exposes diagnostics that follow the input and clear on reset', () => {
    const { estimator } = estimate(1.8, 8000, 60, 1);
    const d = estimator.diagnostics();
    expect(d.sampleRateHz).toBeGreaterThan(55);
    expect(d.sampleRateHz).toBeLessThan(65);
    expect(d.stepsInWindow).toBeGreaterThanOrEqual(4);
    expect(d.intervalCv).toBeLessThan(0.1);
    estimator.reset();
    expect(estimator.diagnostics()).toEqual({ sampleRateHz: 0, signal: 0, envelope: 0, threshold: config.stepThreshold, stepsInWindow: 0, intervalCv: 0 });
  });
});
