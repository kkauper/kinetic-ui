import { useEffect, useRef } from 'react';

let lastTitle: string | null = null;

/**
 * Per page: sets the document title and returns a ref for the page's `<h1>`.
 * On the first page load nothing is focused (the browser's own start position
 * is right); on every later route change focus moves to the h1 so keyboard and
 * screen-reader users land at the top of the new page. (Compared by title, so
 * StrictMode's double effect run does not count as a navigation.)
 */
export function usePageFocus<T extends HTMLElement>(title: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    document.title = title;
    const previous = lastTitle;
    lastTitle = title;
    if (previous !== null && previous !== title) ref.current?.focus();
  }, [title]);
  return ref;
}
