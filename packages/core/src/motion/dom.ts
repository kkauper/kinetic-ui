import type { ReadableStore } from '../store';
import type { MotionSnapshot } from './types';

/**
 * Mirrors the effective motion state onto an element attribute (default
 * `data-motion`), immediately and whenever it changes. Any CSS-based library
 * can then react (`[data-motion='moving'] { ... }`) without framework code.
 * Returns an unbind function.
 */
export function bindMotionAttribute(
  store: ReadableStore<MotionSnapshot>,
  target: { setAttribute(name: string, value: string): void },
  attribute = 'data-motion',
): () => void {
  let last: string | null = null;
  const apply = () => {
    const { state } = store.getState();
    if (state === last) return;
    last = state;
    target.setAttribute(attribute, state);
  };
  apply();
  return store.subscribe(apply);
}
