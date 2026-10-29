import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate, useCarriedHref } from './router';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

/**
 * A real `<a href>` for an internal page. A plain left click navigates without a reload;
 * modifier clicks, middle clicks and `target` links are left to the browser (new tab, new window).
 */
export function Link({ to, onClick, target, ...rest }: LinkProps) {
  const href = useCarriedHref(to);
  function handle(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target && target !== '_self') return;
    event.preventDefault();
    navigate(href);
  }
  return <a {...rest} href={href} target={target} onClick={handle} />;
}
