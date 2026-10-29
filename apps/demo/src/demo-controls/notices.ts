export interface NoticeContent {
  kind: 'error' | 'info';
  title: string;
  body: string;
  /** Offer the manual switch as a way out. */
  offerSimulate: boolean;
}

/**
 * The one place that turns the motion source's error strings (core's
 * accelerometer source) into user-facing wording. Matching is on stable key
 * phrases, so a reworded core message falls through to the generic notice
 * instead of silently showing nothing.
 */
export function noticeForError(error: string): NoticeContent {
  const e = error.toLowerCase();
  // First: core's wording for this case also mentions HTTPS, which would hit the branch below.
  if (e.includes('no motion data')) {
    return {
      kind: 'error',
      title: 'No motion data received',
      body: 'Try on a phone over HTTPS.',
      offerSimulate: true,
    };
  }
  if (e.includes('https') || e.includes('secure')) {
    return {
      kind: 'error',
      title: 'Motion sensors need HTTPS',
      body: 'Open the demo over https:// to use Walking mode. Simulate walking works anywhere.',
      offerSimulate: true,
    };
  }
  if (e.includes('not allowed') || e.includes('denied')) {
    return {
      kind: 'error',
      title: 'Motion access was not allowed',
      body: 'On iPhone, allow Motion & Orientation access for this site and try again.',
      offerSimulate: true,
    };
  }
  if (e.includes("doesn't report") || e.includes('not report') || e.includes("doesn't expose")) {
    return {
      kind: 'error',
      title: "This browser doesn't report motion",
      body: 'Try another browser or a phone. Simulate walking works anywhere.',
      offerSimulate: true,
    };
  }
  return { kind: 'error', title: 'Walking mode could not start', body: error, offerSimulate: true };
}
