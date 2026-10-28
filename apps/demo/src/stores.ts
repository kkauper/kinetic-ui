import {
  createFormModel,
  createManualSource,
  createMotionStore,
  createShowFullPolicy,
  createStoragePersistence,
  signupSchema,
} from '@kinetic-ui/core';

/** App-wide singletons, created once at module level. */
export const formModel = createFormModel(signupSchema, {
  // A getter: merely touching `window.localStorage` can throw (blocked storage).
  persistence: createStoragePersistence(() => window.localStorage, 'kinetic-ui:signup'),
});

/** The only handle on an input device; only `demo-controls` may use it. */
export const manualSource = createManualSource();

export const motionStore = createMotionStore({ source: manualSource });

/** Session = page lifetime. */
export const showFull = createShowFullPolicy(motionStore);

// The manual source needs no permission, so it can start immediately.
motionStore.start().catch(() => {
  // Failure is exposed as `motionStore.getState().error`.
});
