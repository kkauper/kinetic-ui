import { useSyncExternalStore } from 'react';

const READOUT_KEY = 'kinetic-ui:debug-readout';

/** `?debug` in the URL shows the pinned readout on load (the sheet still opens only on tap). */
export function hasDebugParam(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

/** "Keep readout on screen": default on, remembered per browser. */
export function readReadoutPreference(): boolean {
  try {
    return window.localStorage.getItem(READOUT_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeReadoutPreference(on: boolean): void {
  try {
    window.localStorage.setItem(READOUT_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable: the switch just won't be remembered.
  }
}


interface DebugUiState {
  /** The bottom sheet is open. */
  isOpen: boolean;
  /** "Keep readout on screen". */
  pinned: boolean;
  /** The pill shows only after Debug was opened once this session, or with `?debug`. */
  shown: boolean;
}

let state: DebugUiState = { isOpen: false, pinned: readReadoutPreference(), shown: hasDebugParam() };
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<DebugUiState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Tiny store for the debug sheet's UI state, shared by the Debug tag, the pill and the sheet. */
export const debugUi = {
  /** `from` is the element that gets focus back when the sheet closes. */
  open(from: HTMLElement) {
    opener = from;
    set({ isOpen: true, shown: true });
  },
  close: () => set({ isOpen: false }),
  setPinned(on: boolean) {
    writeReadoutPreference(on);
    set({ pinned: on });
  },
  returnFocus() {
    if (opener?.isConnected) opener.focus();
  },
};

export function useDebugUi(): DebugUiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
