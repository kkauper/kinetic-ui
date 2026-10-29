import { createEmitter } from '../store';
import type { ReadableStore } from '../store';
import { createCadenceEstimator } from './cadence';
import type { CadenceDiagnostics } from './cadence';
import { DEFAULT_MOTION_CONFIG } from './config';
import type { MotionConfig } from './config';
import { initialMachine, isWalkingActivity, isWalkingCadence, stepMachine } from './machine';
import type { MachineState } from './machine';
import type { ActivityKind, MotionSample, MotionSnapshot, MotionSource, MotionState, Scheduler } from './types';

export interface MotionStore extends ReadableStore<MotionSnapshot> {
  /** Starts the active source and the tick timer. Rejects (and sets `error`) if the source cannot start. */
  start(): Promise<void>;
  stop(): void;
  /** Override the detected state (null removes the override). */
  force(state: MotionState | null): void;
  /** Swaps the input source, restarting automatically if running. Resets detector and hysteresis. */
  setSource(source: MotionSource | null): Promise<void>;
  /** Merges into the config (replacing the object) and re-evaluates. For live tuning; the tick interval applies on the next start. */
  configure(partial: Partial<MotionConfig>): void;
  /** The current immutable config; replaced, never mutated, by `configure`. */
  readonly config: MotionConfig;
  /**
   * DEBUG ONLY, unstable: internals of the cadence estimator for the debug sheet. Not part of the
   * snapshot, not mirrored in the Rust core, may change without notice.
   */
  getDiagnostics(): CadenceDiagnostics;
  /** DEBUG ONLY, unstable: milestones of the switch to moving since the current source started. */
  getTimeline(): SwitchTimeline;
  /**
   * DEBUG ONLY, unstable: listens to every raw sample the source delivers (used by the trace recorder).
   * Returns the unsubscribe function. Not mirrored in the Rust core.
   */
  onSample(listener: (sample: MotionSample) => void): () => void;
}

/** DEBUG ONLY, unstable: when things happened since the source started, in store-clock ms (null: not yet). */
export interface SwitchTimeline {
  startedAt: number | null;
  firstStepAt: number | null;
  /** First time the input said "walking". */
  firstWalkingAt: number | null;
  /** Times a pending change to moving was dropped before it committed. */
  restarts: number;
  movingAt: number | null;
  /** The latest walking input (cadence in band, or an activity). */
  walking: boolean;
  /** Progress (ms) of the pending change, see `stepMachine`. */
  progressMs: number;
}

export interface MotionStoreOptions {
  source?: MotionSource;
  config?: Partial<MotionConfig>;
  /** Clock in ms; sample timestamps must use the same clock. */
  now?: () => number;
  scheduler?: Scheduler;
}

function defaultScheduler(): Scheduler {
  const g = globalThis as unknown as {
    setInterval(fn: () => void, ms: number): unknown;
    clearInterval(handle: unknown): void;
  };
  return {
    setInterval: (fn, ms) => g.setInterval(fn, ms),
    clearInterval: (handle) => g.clearInterval(handle),
  };
}

function sameSnapshot(a: MotionSnapshot, b: MotionSnapshot): boolean {
  return (Object.keys(a) as (keyof MotionSnapshot)[]).every((key) => a[key] === b[key]);
}

/**
 * Combines a motion source, a cadence estimator and a hysteresis machine into
 * one observable snapshot. Snapshots are immutable and replaced only on change.
 */
export function createMotionStore(options: MotionStoreOptions = {}): MotionStore {
  let config: MotionConfig = { ...DEFAULT_MOTION_CONFIG, ...options.config };
  const now = options.now ?? (() => Date.now());
  const scheduler = options.scheduler ?? defaultScheduler();
  const estimator = createCadenceEstimator(() => config);
  const emitter = createEmitter();
  const sampleListeners = new Set<(sample: MotionSample) => void>();

  let source: MotionSource | null = options.source ?? null;
  let machine: MachineState = initialMachine(now());
  let forced: MotionState | null = null;
  /** True once the source reports states directly, which bypasses the estimator. */
  let explicit = false;
  /** Latest OS activity sample; while set, it (not the cadence) decides "walking". */
  let lastActivity: { activity: ActivityKind; confidence: number } | null = null;
  /** True between start() and stop(); decides whether setSource restarts. */
  let active = false;
  let running = false;
  let error: string | null = null;
  let timer: unknown = null;
  /** Bumped on stop/setSource/start so late async results are ignored. */
  let generation = 0;
  let walkingNow = false;
  let timeline = { startedAt: null as number | null, firstWalkingAt: null as number | null, restarts: 0, movingAt: null as number | null };

  let snapshot: MotionSnapshot = {
    state: 'still',
    detected: 'still',
    forced: null,
    cadence: 0,
    activity: null,
    enteredAt: machine.enteredAt,
    pending: null,
    pendingSince: null,
    source: source?.id ?? null,
    running: false,
    error: null,
  };

  function publish(): void {
    const t = now();
    const state = forced ?? machine.state;
    const next: MotionSnapshot = {
      state,
      detected: machine.state,
      forced,
      cadence: explicit || lastActivity ? 0 : estimator.cadence(t),
      activity: explicit ? null : (lastActivity?.activity ?? null),
      enteredAt: state === snapshot.state ? snapshot.enteredAt : t,
      pending: machine.pending,
      pendingSince: machine.pendingSince,
      source: source?.id ?? null,
      running,
      error,
    };
    if (sameSnapshot(snapshot, next)) return;
    snapshot = next;
    emitter.emit();
  }

  function evaluate(): void {
    if (!explicit) {
      const walking = lastActivity
        ? isWalkingActivity(lastActivity.activity, lastActivity.confidence, config)
        : isWalkingCadence(estimator.cadence(now()), config);
      const before = machine;
      machine = stepMachine(machine, { now: now(), walking }, config);
      walkingNow = walking;
      if (walking) timeline.firstWalkingAt ??= now();
      if (before.pending === 'moving' && machine.pending === null && machine.state === 'still') timeline.restarts++;
      if (machine.state === 'moving' && before.state === 'still') timeline.movingAt ??= now();
    }
    publish();
  }

  function handleSample(sample: MotionSample): void {
    for (const listener of [...sampleListeners]) listener(sample);
    if (sample.kind === 'state') {
      explicit = true;
      lastActivity = null;
      estimator.reset();
      machine =
        sample.state === machine.state
          ? { ...machine, pending: null, pendingSince: null, progressMs: 0, progressAt: null }
          : { state: sample.state, enteredAt: now(), pending: null, pendingSince: null, progressMs: 0, progressAt: null };
      publish();
    } else if (sample.kind === 'activity') {
      explicit = false;
      estimator.reset();
      lastActivity = { activity: sample.activity, confidence: sample.confidence };
      evaluate();
    } else {
      explicit = false;
      lastActivity = null;
      estimator.push(sample);
      evaluate();
    }
  }

  function halt(): void {
    generation++;
    if (timer !== null) scheduler.clearInterval(timer);
    timer = null;
    source?.stop();
    running = false;
    estimator.reset();
    timeline = { startedAt: null, firstWalkingAt: null, restarts: 0, movingAt: null };
    walkingNow = false;
    machine = initialMachine(now());
    explicit = false;
    lastActivity = null;
  }

  async function launch(): Promise<void> {
    const mine = ++generation;
    const current = source;
    error = null;
    if (!current) return publish();
    try {
      await current.start((sample) => {
        if (mine === generation) handleSample(sample);
      });
    } catch (e) {
      if (mine !== generation) return;
      error = e instanceof Error ? e.message : String(e);
      active = false;
      running = false;
      publish();
      throw e;
    }
    if (mine !== generation) {
      current.stop();
      return;
    }
    running = true;
    timeline.startedAt = now();
    timer = scheduler.setInterval(evaluate, config.tickIntervalMs);
    publish();
  }

  return {
    get config() {
      return config;
    },
    getState: () => snapshot,
    subscribe: emitter.subscribe,
    getDiagnostics: () => estimator.diagnostics(),
    getTimeline: () => ({
      ...timeline,
      firstStepAt: estimator.diagnostics().firstStepAt,
      walking: walkingNow,
      progressMs: machine.progressMs,
    }),
    onSample(listener) {
      sampleListeners.add(listener);
      return () => {
        sampleListeners.delete(listener);
      };
    },

    start() {
      if (active) return Promise.resolve();
      active = true;
      return launch();
    },

    stop() {
      active = false;
      halt();
      publish();
    },

    configure(partial) {
      config = { ...config, ...partial };
      evaluate();
    },

    force(state) {
      forced = state;
      publish();
    },

    setSource(next) {
      halt();
      source = next;
      error = null;
      publish();
      return active && next ? launch() : Promise.resolve();
    },
  };
}
