// Runs the language-neutral fixtures from @kinetic-ui/spec against the TypeScript
// implementation. Other implementations (Rust, Swift, Kotlin) run the same files.
import { describe, expect, it } from 'vitest';
import classifyFixture from '@kinetic-ui/spec/fixtures/motion-classify.json';
import emailFixture from '@kinetic-ui/spec/fixtures/email.json';
import formFixture from '@kinetic-ui/spec/fixtures/form.json';
import machineFixture from '@kinetic-ui/spec/fixtures/motion-machine.json';
import storeFixture from '@kinetic-ui/spec/fixtures/motion-store.json';
import tracesFixture from '@kinetic-ui/spec/fixtures/cadence-traces.json';
import {
  createCadenceEstimator,
  createFormModel,
  createMemoryPersistence,
  createMotionStore,
  createShowFullPolicy,
  DEFAULT_MOTION_CONFIG,
  emailDomainCompletions,
  initialMachine,
  isWalkingActivity,
  isWalkingCadence,
  normalizeEmail,
  signupSchema,
  stepMachine,
  suggestEmailDomain,
} from './index';
import type {
  ActivityKind,
  Answers,
  AnswerValue,
  MotionConfig,
  MotionSample,
  MotionSnapshot,
  MotionSource,
  MotionState,
  PersistedForm,
  Scheduler,
  ShowFullState,
} from './index';

interface Named {
  name: string;
}
const cases = <T extends Named>(fixture: unknown): T[] => (fixture as { cases: T[] }).cases;
const withConfig = (partial?: Partial<MotionConfig>): MotionConfig => ({ ...DEFAULT_MOTION_CONFIG, ...partial });

describe('motion-machine.json', () => {
  interface Step {
    t: number;
    walking: boolean;
    expect?: { state: MotionState; pending: MotionState | null; enteredAt?: number; pendingSince?: number };
  }
  for (const c of cases<Named & { config?: Partial<MotionConfig>; steps: Step[] }>(machineFixture)) {
    it(c.name, () => {
      const config = withConfig(c.config);
      let machine = initialMachine(0);
      for (const step of c.steps) {
        machine = stepMachine(machine, { now: step.t, walking: step.walking }, config);
        if (step.expect) expect(machine, `t=${step.t}`).toMatchObject(step.expect);
      }
    });
  }
});

describe('motion-classify.json', () => {
  type Input = { cadence: number } | { activity: ActivityKind; confidence: number };
  for (const c of cases<Named & { config?: Partial<MotionConfig>; input: Input; walking: boolean }>(classifyFixture)) {
    it(c.name, () => {
      const config = withConfig(c.config);
      const walking =
        'cadence' in c.input
          ? isWalkingCadence(c.input.cadence, config)
          : isWalkingActivity(c.input.activity, c.input.confidence, config);
      expect(walking).toBe(c.walking);
    });
  }
});

describe('cadence-traces.json', () => {
  interface Trace {
    samples: [number, number, number, number][];
    expect: { t: number; cadence: number; tolerance: number }[];
  }
  for (const c of cases<Named & Trace>(tracesFixture)) {
    it(c.name, () => {
      const estimator = createCadenceEstimator(DEFAULT_MOTION_CONFIG);
      const pending = [...c.expect].sort((a, b) => a.t - b.t);
      const check = (e: Trace['expect'][number]) =>
        expect(Math.abs(estimator.cadence(e.t) - e.cadence), `cadence at t=${e.t}`).toBeLessThanOrEqual(e.tolerance);
      for (const [t, x, y, z] of c.samples) {
        estimator.push({ t, x, y, z });
        while (pending[0] && pending[0].t <= t) check(pending.shift()!);
      }
      pending.forEach(check);
    });
  }
});

describe('motion-store.json', () => {
  type Sample =
    | { kind: 'state'; state: MotionState }
    | { kind: 'activity'; activity: ActivityKind; confidence: number };
  interface Expect extends Partial<Pick<MotionSnapshot, 'state' | 'detected' | 'forced' | 'pending' | 'activity'>> {
    showFull?: ShowFullState;
  }
  type Event = { t: number; expect?: Expect } & (
    | { do: 'sample'; sample: Sample }
    | { do: 'tick' | 'showFull' | 'resetSession' }
    | { do: 'force'; state: MotionState | null }
  );
  for (const c of cases<Named & { config?: Partial<MotionConfig>; showFull?: boolean; events: Event[] }>(storeFixture)) {
    it(c.name, async () => {
      let time = 0;
      let emit: (sample: MotionSample) => void = () => {};
      let tick: () => void = () => {};
      const source: MotionSource = { id: 'fixture', start: (e) => void (emit = e), stop: () => {} };
      const scheduler: Scheduler = {
        setInterval: (fn) => void (tick = fn),
        clearInterval: () => {},
      };
      const store = createMotionStore({ source, config: c.config, now: () => time, scheduler });
      const policy = c.showFull ? createShowFullPolicy(store) : null;
      await store.start();

      for (const event of c.events) {
        time = event.t;
        switch (event.do) {
          case 'sample':
            emit({ ...event.sample, t: event.t });
            break;
          case 'tick':
            tick();
            break;
          case 'force':
            store.force(event.state);
            break;
          case 'showFull':
            policy!.showFull();
            break;
          case 'resetSession':
            policy!.resetSession();
            break;
        }
        if (!event.expect) continue;
        const { showFull, ...snapshot } = event.expect;
        expect(store.getState(), `t=${event.t} ${event.do}`).toMatchObject(snapshot);
        if (showFull) expect(policy!.getState(), `t=${event.t} show-full`).toEqual(showFull);
      }
    });
  }
});

describe('form.json', () => {
  type Action =
    | { do: 'setAnswer'; id: string; value: AnswerValue | null }
    | { do: 'next' | 'back' | 'jumpToFirstUnanswered' | 'validateAll' | 'reset' }
    | { do: 'goTo'; step: number }
    | { do: 'defer'; id?: string };
  type Step = Action & {
    expect?: {
      answers?: Answers;
      currentStep?: number;
      deferred?: string[];
      errorIds?: string[];
      errors?: Record<string, string>;
      returned?: boolean;
    };
  };
  const schemas = { signup: signupSchema };
  for (const c of cases<Named & { schema: keyof typeof schemas; stored?: PersistedForm; actions: Step[] }>(formFixture)) {
    it(c.name, () => {
      const model = createFormModel(schemas[c.schema], { persistence: createMemoryPersistence(c.stored) });
      c.actions.forEach((action, i) => {
        let returned: boolean | undefined;
        switch (action.do) {
          case 'setAnswer':
            model.setAnswer(action.id, action.value ?? undefined);
            break;
          case 'next':
            returned = model.next();
            break;
          case 'back':
            model.back();
            break;
          case 'goTo':
            model.goTo(action.step);
            break;
          case 'defer':
            returned = model.defer(action.id);
            break;
          case 'jumpToFirstUnanswered':
            model.jumpToFirstUnanswered();
            break;
          case 'validateAll':
            returned = model.validateAll();
            break;
          case 'reset':
            model.reset();
            break;
        }
        const want = action.expect;
        if (!want) return;
        const state = model.getState();
        const at = `action ${i} (${action.do})`;
        if (want.answers) expect(state.answers, at).toEqual(want.answers);
        if (want.currentStep !== undefined) expect(state.currentStep, at).toBe(want.currentStep);
        if (want.deferred) expect(state.deferred, at).toEqual(want.deferred);
        if (want.errorIds) expect(Object.keys(state.errors).sort(), at).toEqual([...want.errorIds].sort());
        if (want.errors) expect(state.errors, at).toEqual(want.errors);
        if (want.returned !== undefined) expect(returned, at).toBe(want.returned);
      });
    });
  }
});

describe('email.json', () => {
  const fixture = emailFixture as unknown as {
    normalize: { input: string; output: string }[];
    completions: { input: string; output: string[] }[];
    suggestions: { input: string; output: string | null }[];
  };
  for (const c of fixture.normalize) {
    it(`normalize ${JSON.stringify(c.input)}`, () => expect(normalizeEmail(c.input)).toBe(c.output));
  }
  for (const c of fixture.completions) {
    it(`completions ${JSON.stringify(c.input)}`, () =>
      expect(emailDomainCompletions(c.input).map((x) => x.email)).toEqual(c.output));
  }
  for (const c of fixture.suggestions) {
    it(`suggestion ${JSON.stringify(c.input)}`, () =>
      expect(suggestEmailDomain(c.input)?.email ?? null).toBe(c.output));
  }
});
