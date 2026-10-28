import { describe, expect, it, vi } from 'vitest';
import {
  createFormModel,
  createMemoryPersistence,
  createStoragePersistence,
  defineSchema,
  signupSchema,
  validateAll,
  type FormPersistence,
  type KeyValueStorage,
  type PersistedForm,
} from './index';

const VALID_EMAIL = 'ada@example.com';

function setup(persistence: FormPersistence = createMemoryPersistence()) {
  return { persistence, model: createFormModel(signupSchema, { persistence }) };
}

describe('initial state', () => {
  it('starts empty at step 0', () => {
    const { model } = setup();
    expect(model.getState()).toEqual({ answers: {}, currentStep: 0, deferred: [], errors: {} });
  });

  it('signup schema has the five expected fields', () => {
    expect(signupSchema.fields.map((f) => f.id)).toEqual([
      'email',
      'firstName',
      'referral',
      'newsletter',
      'frequency',
    ]);
  });
});

describe('setAnswer and persistence', () => {
  it('saves every answer immediately', () => {
    const { model, persistence } = setup();
    const save = vi.spyOn(persistence, 'save');
    model.setAnswer('email', 'a');
    model.setAnswer('email', 'ab');
    expect(save).toHaveBeenCalledTimes(2);
    expect(persistence.load()).toEqual({
      schemaId: 'signup',
      schemaVersion: 1,
      answers: { email: 'ab' },
      deferred: [],
    });
  });

  it('throws on unknown field ids', () => {
    const { model } = setup();
    expect(() => model.setAnswer('nope', 'x')).toThrow(/Unknown field/);
  });

  it('removes the key when set to undefined', () => {
    const { model } = setup();
    model.setAnswer('email', VALID_EMAIL);
    model.setAnswer('email', undefined);
    expect('email' in model.getState().answers).toBe(false);
  });

  it('restores answers when re-created with the same persistence', () => {
    const { persistence, model } = setup();
    model.setAnswer('email', VALID_EMAIL);
    model.setAnswer('firstName', 'Ada');
    model.defer('referral');
    const reloaded = createFormModel(signupSchema, { persistence });
    expect(reloaded.getState().answers).toEqual({ email: VALID_EMAIL, firstName: 'Ada' });
    expect(reloaded.getState().deferred).toEqual([]);
    expect(reloaded.getState().currentStep).toBe(2);
  });

  it('keeps deferred fields across a reload and skips them', () => {
    const { persistence, model } = setup();
    model.setAnswer('email', VALID_EMAIL);
    model.defer('firstName');
    const reloaded = createFormModel(signupSchema, { persistence });
    expect(reloaded.getState().deferred).toEqual(['firstName']);
    expect(reloaded.getState().currentStep).toBe(2);
  });

  it('ignores stored data from another schema version', () => {
    const stale: PersistedForm = {
      schemaId: 'signup',
      schemaVersion: 99,
      answers: { email: VALID_EMAIL },
      deferred: [],
    };
    const model = createFormModel(signupSchema, { persistence: createMemoryPersistence(stale) });
    expect(model.getState().answers).toEqual({});
  });

  it('drops answers for unknown ids', () => {
    const stored: PersistedForm = {
      schemaId: 'signup',
      schemaVersion: 1,
      answers: { email: VALID_EMAIL, legacy: 'x' },
      deferred: ['legacy'],
    };
    const model = createFormModel(signupSchema, { persistence: createMemoryPersistence(stored) });
    expect(model.getState().answers).toEqual({ email: VALID_EMAIL });
    expect(model.getState().deferred).toEqual([]);
  });
});

describe('next / back / goTo', () => {
  it('blocks on a required empty email and clears the error on setAnswer', () => {
    const { model } = setup();
    expect(model.next()).toBe(false);
    expect(model.getState().currentStep).toBe(0);
    expect(model.getState().errors.email).toBe('Email is required.');
    model.setAnswer('email', 'x');
    expect(model.getState().errors.email).toBeUndefined();
  });

  it('blocks on an invalid email', () => {
    const { model } = setup();
    model.setAnswer('email', 'not-an-email');
    expect(model.next()).toBe(false);
    expect(model.getState().errors.email).toBe('Enter a valid email address, like name@example.com.');
  });

  it('advances on a valid (padded) email', () => {
    const { model } = setup();
    model.setAnswer('email', `  ${VALID_EMAIL} `);
    expect(model.next()).toBe(true);
    expect(model.getState().currentStep).toBe(1);
  });

  it('clamps at both ends', () => {
    const { model } = setup();
    model.back();
    expect(model.getState().currentStep).toBe(0);
    model.setAnswer('email', VALID_EMAIL);
    for (let i = 0; i < 10; i++) model.next();
    expect(model.getState().currentStep).toBe(signupSchema.fields.length);
    model.goTo(-5);
    expect(model.getState().currentStep).toBe(0);
    model.goTo(99);
    expect(model.getState().currentStep).toBe(signupSchema.fields.length);
  });
});

describe('defer', () => {
  it('refuses non-deferrable fields', () => {
    const { model } = setup();
    expect(model.defer()).toBe(false);
    expect(model.defer('email')).toBe(false);
    expect(model.getState().deferred).toEqual([]);
  });

  it('defers the current field, advances, and avoids duplicates', () => {
    const { model } = setup();
    model.goTo(1);
    expect(model.defer()).toBe(true);
    expect(model.getState().deferred).toEqual(['firstName']);
    expect(model.getState().currentStep).toBe(2);
    expect(model.defer('firstName')).toBe(true);
    expect(model.getState().deferred).toEqual(['firstName']);
    expect(model.getState().currentStep).toBe(2);
  });

  it('does not move the step when deferring another field', () => {
    const { model } = setup();
    model.defer('firstName');
    expect(model.getState().currentStep).toBe(0);
  });

  it('removes a field from deferred once it is answered', () => {
    const { model, persistence } = setup();
    model.defer('firstName');
    expect(model.pendingDeferred()).toEqual(['firstName']);
    model.setAnswer('firstName', 'Ada');
    expect(model.getState().deferred).toEqual([]);
    expect(model.pendingDeferred()).toEqual([]);
    expect(persistence.load()?.deferred).toEqual([]);
  });
});

describe('jumpToFirstUnanswered', () => {
  it('skips answered and deferred fields', () => {
    const { model } = setup();
    model.setAnswer('email', VALID_EMAIL);
    model.defer('firstName');
    model.jumpToFirstUnanswered();
    expect(model.getState().currentStep).toBe(2);
  });

  it('goes to the done index when everything is answered or deferred', () => {
    const { model } = setup();
    model.setAnswer('email', VALID_EMAIL);
    model.defer('firstName');
    model.setAnswer('referral', 'friend');
    model.setAnswer('newsletter', false);
    model.setAnswer('frequency', 0);
    model.jumpToFirstUnanswered();
    expect(model.getState().currentStep).toBe(signupSchema.fields.length);
  });
});

describe('answers and validation', () => {
  it('counts an explicit false toggle as answered', () => {
    const { model } = setup();
    expect(model.isAnswered('newsletter')).toBe(false);
    model.setAnswer('newsletter', false);
    expect(model.isAnswered('newsletter')).toBe(true);
  });

  it('validateAll reports only failing fields', () => {
    expect(validateAll(signupSchema, {})).toEqual({ email: 'Email is required.' });
    expect(validateAll(signupSchema, { email: VALID_EMAIL })).toEqual({});
  });

  it('model.validateAll sets errors and returns the result', () => {
    const { model } = setup();
    expect(model.validateAll()).toBe(false);
    expect(model.getState().errors).toEqual({ email: 'Email is required.' });
    model.setAnswer('email', VALID_EMAIL);
    expect(model.validateAll()).toBe(true);
    expect(model.getState().errors).toEqual({});
  });
});

describe('reset', () => {
  it('clears state and persistence', () => {
    const { model, persistence } = setup();
    model.setAnswer('email', VALID_EMAIL);
    model.defer('firstName');
    model.next();
    model.reset();
    expect(model.getState()).toEqual({ answers: {}, currentStep: 0, deferred: [], errors: {} });
    expect(persistence.load()).toBeNull();
  });
});

describe('store behaviour', () => {
  it('keeps the same reference and does not emit on no-ops', () => {
    const { model } = setup();
    model.setAnswer('email', VALID_EMAIL);
    const listener = vi.fn();
    model.subscribe(listener);
    const before = model.getState();
    model.setAnswer('email', VALID_EMAIL);
    model.goTo(0);
    model.back();
    model.jumpToFirstUnanswered();
    model.goTo(1);
    model.goTo(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(model.getState()).not.toBe(before);
    const after = model.getState();
    expect(model.validateAll()).toBe(true);
    expect(model.getState()).toBe(after);
  });

  it('does not emit when next() fails with the same error twice', () => {
    const { model } = setup();
    expect(model.next()).toBe(false);
    const listener = vi.fn();
    model.subscribe(listener);
    const before = model.getState();
    expect(model.next()).toBe(false);
    expect(model.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not emit or save when re-deferring an already deferred field', () => {
    const { model, persistence } = setup();
    model.defer('firstName');
    const listener = vi.fn();
    model.subscribe(listener);
    const save = vi.spyOn(persistence, 'save');
    const before = model.getState();
    expect(model.defer('firstName')).toBe(true);
    expect(model.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const { model } = setup();
    const listener = vi.fn();
    const unsubscribe = model.subscribe(listener);
    model.setAnswer('email', 'a');
    unsubscribe();
    model.setAnswer('email', 'b');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('createStoragePersistence', () => {
  const data: PersistedForm = {
    schemaId: 'signup',
    schemaVersion: 1,
    answers: { email: VALID_EMAIL },
    deferred: ['firstName'],
  };

  function fakeStorage(): KeyValueStorage & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  }

  it('round-trips through working storage and clears', () => {
    const storage = fakeStorage();
    const p = createStoragePersistence(() => storage, 'k');
    expect(p.load()).toBeNull();
    p.save(data);
    expect(p.load()).toEqual(data);
    p.clear();
    expect(storage.map.size).toBe(0);
  });

  it('degrades silently when getStorage throws', () => {
    const p = createStoragePersistence(() => {
      throw new Error('SecurityError');
    }, 'k');
    expect(p.load()).toBeNull();
    expect(() => p.save(data)).not.toThrow();
    expect(() => p.clear()).not.toThrow();
  });

  it('degrades silently when storage is unavailable', () => {
    const p = createStoragePersistence(() => null, 'k');
    expect(p.load()).toBeNull();
    expect(() => p.save(data)).not.toThrow();
  });

  it('swallows setItem quota errors', () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const p = createStoragePersistence(() => storage, 'k');
    expect(() => p.save(data)).not.toThrow();
    expect(p.load()).toBeNull();
  });

  it('returns null for corrupted JSON and wrong shapes', () => {
    const storage = fakeStorage();
    const p = createStoragePersistence(() => storage, 'k');
    for (const raw of [
      '{not json',
      'null',
      '42',
      JSON.stringify({ ...data, answers: 'x' }),
      JSON.stringify({ ...data, answers: null }),
      JSON.stringify({ ...data, deferred: [1] }),
      JSON.stringify({ ...data, deferred: 'firstName' }),
    ]) {
      storage.map.set('k', raw);
      expect(p.load()).toBeNull();
    }
  });
});

describe('defineSchema', () => {
  const base = { id: 's', version: 1, title: 'T' };

  it('rejects required + deferrable', () => {
    const fields = [{ id: 'a', kind: 'toggle', label: 'A', required: true, deferrable: true }];
    expect(() => defineSchema({ ...base, fields })).toThrow(/required and deferrable/);
  });

  it('rejects duplicate ids', () => {
    const fields = [
      { id: 'a', kind: 'toggle', label: 'A' },
      { id: 'a', kind: 'toggle', label: 'B' },
    ];
    expect(() => defineSchema({ ...base, fields })).toThrow(/Duplicate field id "a"/);
  });

  it('rejects unknown kinds, thin choices and bad sliders', () => {
    expect(() => defineSchema({ ...base, fields: [{ id: 'a', kind: 'date', label: 'A' }] })).toThrow(/unknown kind/);
    const choice = { id: 'a', kind: 'choice', label: 'A', options: [{ value: 'x', label: 'X' }] };
    expect(() => defineSchema({ ...base, fields: [choice] })).toThrow(/at least 2 options/);
    const slider = { id: 'a', kind: 'slider', label: 'A', min: 3, max: 3, step: 1 };
    expect(() => defineSchema({ ...base, fields: [slider] })).toThrow(/min < max/);
  });
});
