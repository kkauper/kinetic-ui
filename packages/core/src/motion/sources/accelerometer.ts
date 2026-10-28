import type { MotionSample, MotionSource } from '../types';

/** Structural subset of DeviceMotionEvent, so core needs no DOM types. */
export interface DeviceMotionLike {
  accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null } | null;
}

export interface MotionEventTarget {
  addEventListener(type: 'devicemotion', listener: (event: DeviceMotionLike) => void): void;
  removeEventListener(type: 'devicemotion', listener: (event: DeviceMotionLike) => void): void;
}

export interface AccelerometerEnvironment {
  /** Where devicemotion events fire (window). Undefined = unsupported. */
  target: MotionEventTarget | undefined;
  /** iOS 13+ (and newer Chrome): DeviceMotionEvent.requestPermission. Undefined when not required. */
  requestPermission?: () => Promise<string>;
  /** window.isSecureContext; sensors need HTTPS. */
  secureContext: boolean;
}

export interface AccelerometerSourceOptions {
  /** Defaults to reading globalThis (window, DeviceMotionEvent, isSecureContext) through structural casts. */
  environment?: () => AccelerometerEnvironment;
  /** Same clock as the store (default Date.now). Do NOT use event.timeStamp (different clock). */
  now?: () => number;
  /** Reject start() if no event with data arrives within this time. Default 3000. */
  firstSampleTimeoutMs?: number;
  scheduler?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
}

const MSG_INSECURE = 'Motion sensors need a secure (HTTPS) connection.';
const MSG_UNSUPPORTED = "This browser doesn't report device motion.";
const MSG_DENIED =
  'Motion access was not allowed. On iPhone, allow Motion & Orientation access for this site and try again.';
const MSG_NO_DATA = 'No motion data received. Try on a phone, over HTTPS.';

function defaultEnvironment(): AccelerometerEnvironment {
  const g = globalThis as unknown as {
    addEventListener?: MotionEventTarget['addEventListener'];
    removeEventListener?: MotionEventTarget['removeEventListener'];
    isSecureContext?: boolean;
    DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
  };
  const hasEvent = g.DeviceMotionEvent !== undefined && typeof g.addEventListener === 'function';
  return {
    target: hasEvent ? (g as unknown as MotionEventTarget) : undefined,
    requestPermission: g.DeviceMotionEvent?.requestPermission?.bind(g.DeviceMotionEvent),
    secureContext: g.isSecureContext ?? false,
  };
}

function defaultScheduler(): Required<AccelerometerSourceOptions>['scheduler'] {
  const g = globalThis as unknown as {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
  return { setTimeout: (fn, ms) => g.setTimeout(fn, ms), clearTimeout: (h) => g.clearTimeout(h) };
}

/**
 * Motion source backed by `devicemotion`.
 *
 * Gesture rule: on iOS, `requestPermission()` only works during a user
 * gesture, so `start()` must be called synchronously from a click handler and
 * calls `requestPermission()` before any `await`.
 *
 * Clock rule: samples are stamped with `now()` (the store's clock), never
 * with `event.timeStamp`, which uses a different time origin.
 *
 * Axis signs differ between iOS and Android, which does not matter: the
 * cadence estimator works on the acceleration magnitude.
 */
export function createAccelerometerSource(options: AccelerometerSourceOptions = {}): MotionSource {
  const readEnvironment = options.environment ?? defaultEnvironment;
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.firstSampleTimeoutMs ?? 3000;
  const scheduler = options.scheduler ?? defaultScheduler();

  /** Tears down the current run; set while a run is active. */
  let teardown: (() => void) | null = null;

  return {
    id: 'accelerometer',

    start(emit: (sample: MotionSample) => void): Promise<void> {
      teardown?.();
      const env = readEnvironment();
      if (!env.secureContext) return Promise.reject(new Error(MSG_INSECURE));
      const target = env.target;
      if (!target) return Promise.reject(new Error(MSG_UNSUPPORTED));

      // Called synchronously (no await before it) to keep the user gesture alive.
      let permission: Promise<string> | undefined;
      if (env.requestPermission) {
        try {
          permission = env.requestPermission();
        } catch {
          return Promise.reject(new Error(MSG_DENIED));
        }
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        let timer: unknown = null;

        const listener = (event: DeviceMotionLike) => {
          const a = event.accelerationIncludingGravity;
          if (!a || a.x === null || a.y === null || a.z === null) return;
          emit({ kind: 'acceleration', t: now(), x: a.x, y: a.y, z: a.z });
          if (!settled) {
            settled = true;
            if (timer !== null) scheduler.clearTimeout(timer);
            timer = null;
            resolve();
          }
        };

        const cleanup = () => {
          target.removeEventListener('devicemotion', listener);
          if (timer !== null) scheduler.clearTimeout(timer);
          timer = null;
          if (teardown === cleanup) teardown = null;
        };
        const fail = (message: string) => {
          cleanup();
          if (settled) return;
          settled = true;
          reject(new Error(message));
        };
        teardown = () => {
          fail('Motion source stopped.');
        };

        const listen = () => {
          if (settled) return;
          target.addEventListener('devicemotion', listener);
          timer = scheduler.setTimeout(() => fail(MSG_NO_DATA), timeoutMs);
        };

        if (permission) {
          permission.then(
            (result) => (result === 'granted' ? listen() : fail(MSG_DENIED)),
            () => fail(MSG_DENIED),
          );
        } else {
          listen();
        }
      });
    },

    stop() {
      teardown?.();
    },
  };
}
