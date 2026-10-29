import { useEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { GitHubMark, LogoMark } from './icons';

export const REPO_URL = 'https://github.com/kkauper/kinetic-ui';

/** Compact brand text size in rem. The logo is 4/3 of it (24 px at 18 px). */
const COMPACT_BRAND_REM = 1.125;

interface HeaderProps {
  /**
   * Landing only: the page's `<h1>` ref and the empty slot in the hero that the large title
   * occupies at scroll 0. Without it the header is just the compact bar with a home link.
   */
  title?: { ref: RefObject<HTMLHeadingElement | null>; slot: RefObject<HTMLElement | null> };
}

function Wordmark() {
  return (
    <>
      <LogoMark />
      <span>
        <span className="k-header__name">Kinetic</span>
        <span className="k-header__suffix"> UI</span>
      </span>
    </>
  );
}

/**
 * Fixed, blurred header on every page: wordmark left, GitHub pill right.
 *
 * Landing (`title`): the wordmark is the page's single `<h1>` ("Kinetic UI"), drawn large over the
 * hero and collapsing into the compact brand while the page scrolls. It is not a link there: it is
 * the home page, and a link to the current page adds nothing (and an `<h1>` inside an `<a>` is
 * avoided). Other pages: the wordmark is the home link and the page has its own `<h1>`.
 *
 * Scroll work is one passive listener that, once per frame, sets `data-scrolled` and `--k-collapse`
 * (0 to 1). Everything else is CSS (transform only). Sizes are measured on mount, resize and font
 * load, never in the scroll handler.
 */
export function Header({ title }: HeaderProps) {
  const header = useRef<HTMLElement>(null);
  const pill = useRef<HTMLAnchorElement>(null);
  const large = title !== undefined;
  const slot = title?.slot;
  const brand = title?.ref;

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    let distance = 1;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const collapse = Math.min(1, y / distance);
      // Landing: the hairline waits until the title has docked (it would cut across the large title).
      el.dataset.scrolled = (large ? collapse >= 1 : y > 0) ? 'true' : 'false';
      if (large) el.style.setProperty('--k-collapse', String(collapse));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(apply);
    };

    const measure = () => {
      const titleEl = brand?.current;
      const slotEl = slot?.current;
      const pillEl = pill.current;
      if (large && titleEl && slotEl && pillEl) {
        const largeFont = parseFloat(getComputedStyle(titleEl).fontSize);
        const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const scale = (COMPACT_BRAND_REM * rootFont) / largeFont;
        const largeTop = slotEl.getBoundingClientRect().top + window.scrollY;
        const pillRect = pillEl.getBoundingClientRect();
        // The compact brand is vertically centred like the GitHub pill.
        const compactTop = pillRect.top + pillRect.height / 2 - (titleEl.offsetHeight * scale) / 2;
        const dy = compactTop - largeTop;
        distance = Math.max(1, -dy);
        el.style.setProperty('--k-title-top', `${largeTop}px`);
        el.style.setProperty('--k-title-dy', `${dy}px`);
        el.style.setProperty('--k-title-shrink', String(1 - scale));
      }
      apply();
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (slot?.current) resizeObserver?.observe(slot.current);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
      resizeObserver?.disconnect();
    };
  }, [large, brand, slot]);

  const style = { '--k-brand-small': `${COMPACT_BRAND_REM}rem` } as CSSProperties;

  return (
    <header ref={header} className="k-header" data-scrolled="false" style={style}>
      <div className="k-header__inner">
        {large ? (
          <h1 ref={brand} tabIndex={-1} className="k-brand k-brand--title">
            <Wordmark />
          </h1>
        ) : (
          <a className="k-brand" href="#/" aria-label="Kinetic UI home">
            <Wordmark />
          </a>
        )}
        <a
          ref={pill}
          className="k-pill-link"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Kinetic UI on GitHub (opens in a new tab)"
          style={{ marginInlineStart: 'auto' }}
        >
          <GitHubMark />
          <span aria-hidden="true">GitHub</span>
        </a>
      </div>
    </header>
  );
}
