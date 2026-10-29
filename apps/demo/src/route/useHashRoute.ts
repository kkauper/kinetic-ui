import { useSyncExternalStore } from 'react';

export type Route = 'landing' | 'demo';

/** `#/demo` is the demo; anything else (empty, `#/`, unknown) is the landing page. */
export function parseRoute(hash: string): Route {
  return hash.replace(/^#/, '').split('?')[0] === '/demo' ? 'demo' : 'landing';
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

/**
 * Tiny hash router: no dependency, works on any static host, and the query
 * string (`/?debug#/demo`) stays untouched because it lives before the hash.
 */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
