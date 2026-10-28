import type { Answers } from './schema';

export interface PersistedForm {
  schemaId: string;
  schemaVersion: number;
  answers: Answers;
  deferred: string[];
}

export interface FormPersistence {
  load(): PersistedForm | null;
  save(data: PersistedForm): void;
  clear(): void;
}

/** Minimal structural subset of the Web Storage API, so core needs no DOM types. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isPersistedForm(value: unknown): value is PersistedForm {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.schemaId === 'string' &&
    typeof data.schemaVersion === 'number' &&
    typeof data.answers === 'object' &&
    data.answers !== null &&
    !Array.isArray(data.answers) &&
    Array.isArray(data.deferred) &&
    data.deferred.every((id) => typeof id === 'string')
  );
}

/**
 * Persists to a Web-Storage-like object. Storage can be missing, blocked,
 * full or corrupted, so every access is guarded and failures degrade
 * silently to "nothing stored".
 */
export function createStoragePersistence(
  getStorage: () => KeyValueStorage | null | undefined,
  key: string,
): FormPersistence {
  return {
    load() {
      try {
        const raw = getStorage()?.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isPersistedForm(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(data) {
      try {
        getStorage()?.setItem(key, JSON.stringify(data));
      } catch {
        // Quota exceeded or storage unavailable: keep working in memory.
      }
    },
    clear() {
      try {
        getStorage()?.removeItem(key);
      } catch {
        // Nothing to clear if storage is unavailable.
      }
    },
  };
}

/** In-memory persistence, useful for tests and as a no-storage fallback. */
export function createMemoryPersistence(initial?: PersistedForm): FormPersistence {
  let stored: PersistedForm | null = initial ?? null;
  return {
    load: () => stored,
    save(data) {
      stored = data;
    },
    clear() {
      stored = null;
    },
  };
}
