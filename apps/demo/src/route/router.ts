import { useSyncExternalStore } from 'react';

export type Route = 'landing' | 'demo' | 'privacy' | 'not-found';

const listeners = new Set<() => void>();

/** `/`, `/demo` and `/privacy` are pages; any other path is "not found". A trailing slash is ignored. */
export function parseRoute(pathname: string): Route {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '') return 'landing';
  if (path === '/demo') return 'demo';
  if (path === '/privacy') return 'privacy';
  return 'not-found';
}

/**
 * Old links used hash routes (`/?debug#/demo`). Rewrite them in place to the path URL
 * (`/demo?debug`) before the first render. Unknown old hash routes land on the home page.
 */
export function redirectLegacyHash(): void {
  const { hash, search } = window.location;
  if (!hash.startsWith('#/')) return;
  const [rawPath = '/', hashQuery = ''] = hash.slice(1).split('?');
  const route = parseRoute(rawPath);
  const path = route === 'demo' ? '/demo' : route === 'privacy' ? '/privacy' : '/';
  const query = [search.slice(1), hashQuery].filter(Boolean).join('&');
  window.history.replaceState(null, '', path + (query ? `?${query}` : ''));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

/** Re-renders on every navigation (also for query changes, so links can carry `?debug`). */
function useLocationKey(): string {
  return useSyncExternalStore(subscribe, snapshot);
}

export function useRoute(): Route {
  useLocationKey();
  return parseRoute(window.location.pathname);
}

/** `?debug` is the one query parameter that follows the visitor from page to page. */
export function withCarriedQuery(path: string): string {
  if (path.includes('?')) return path;
  return new URLSearchParams(window.location.search).has('debug') ? `${path}?debug` : path;
}

export function navigate(to: string): void {
  if (to === snapshot()) return;
  window.history.pushState(null, '', to);
  listeners.forEach((l) => l());
}

/** For the `Link` component: re-render when the location changes. */
export function useCarriedHref(path: string): string {
  useLocationKey();
  return withCarriedQuery(path);
}
