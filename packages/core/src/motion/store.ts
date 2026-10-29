import { createEmitter } from '../store';
import type { ReadableStore } from '../store';
import { createCadenceEstimator } from './cadence';
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
      machine = stepMachine(machine, { now: now(), walking }, config);
    }
    publish();
  }

  function onSample(sample: MotionSample): void {
    if (sample.kind === 'state') {
      explicit = true;
      lastActivity = null;
      estimator.reset();
      machine =
        sample.state === machine.state
          ? { ...machine, pending: null, pendingSince: null }
          : { state: sample.state, enteredAt: now(), pending: null, pendingSince: null };
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
        if (mine === generation) onSample(sample);
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
    timer = scheduler.setInterval(evaluate, config.tickIntervalMs);
    publish();
  }

  return {
    get config() {
      return config;
    },
    getState: () => snapshot,
    subscribe: emitter.subscribe,

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
