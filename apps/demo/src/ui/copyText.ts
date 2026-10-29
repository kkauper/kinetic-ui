/**
 * Copy text to the clipboard.
 *
 * The async Clipboard API only exists in secure contexts (https or localhost) and can reject (permissions,
 * iframes without clipboard-write, lost focus). The fallback is a synchronous `execCommand('copy')` on a
 * temporary textarea, which works over plain http (a dev server opened by LAN IP on a phone) and keeps the
 * click's user activation when the API is missing.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the legacy path. Activation usually lasts a few seconds, so it can still work.
      }
    }
    return legacyCopy(text);
  } catch {
    return false;
  }
}

function legacyCopy(text: string): boolean {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const ranges: Range[] = [];
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i));
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  // 16px stops iOS Safari zooming the page when the field is focused.
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px;';
  document.body.appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length); // iOS Safari ignores select()
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    previous?.focus({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
