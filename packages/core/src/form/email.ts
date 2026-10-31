/** Domains offered as one-tap chips while typing an address. */
export const QUICK_EMAIL_DOMAINS = ['gmail.com', 'icloud.com', 'outlook.com'];

/** Domains used to spot typos like "gmial.com". */
export const COMMON_EMAIL_DOMAINS = [
  'gmail.com',
  'icloud.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'me.com',
  'live.com',
  'gmx.de',
  'web.de',
  'proton.me',
];

export interface EmailCompletion {
  domain: string;
  email: string;
}

/**
 * Removes all whitespace (emails cannot contain any, e.g. a space autocorrect
 * inserted after "@") and lowercases the domain; the local part keeps its case.
 */
export function normalizeEmail(value: string): string {
  const compact = value.replace(/\s+/g, '');
  const at = compact.lastIndexOf('@');
  if (at === -1) return compact;
  return compact.slice(0, at + 1) + compact.slice(at + 1).toLowerCase();
}

/**
 * Domains that could finish what the user typed: all of them before an "@",
 * the ones starting with the typed fragment after it (never an exact match).
 */
export function emailDomainCompletions(
  value: string,
  domains: readonly string[] = QUICK_EMAIL_DOMAINS,
): EmailCompletion[] {
  const text = normalizeEmail(value);
  const at = text.indexOf('@');
  const local = at === -1 ? text : text.slice(0, at);
  if (local === '') return [];
  const fragment = at === -1 ? '' : text.slice(at + 1);
  return domains
    .filter((domain) => domain.startsWith(fragment) && domain !== fragment)
    .map((domain) => ({ domain, email: `${local}@${domain}` }));
}

/** Longer domains get no suggestion (real domains are at most 253 characters, the known ones under 12), so the edit table stays small. Counted in UTF-16 units. */
const MAX_SUGGEST_DOMAIN_LENGTH = 64;

/** Edit distance where swapping two adjacent characters counts as one edit. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Suggests a known domain for a probable typo (distance <= 2). Only for
 * complete-looking domains (containing a dot) that are not already known;
 * ties go to the first domain in the list.
 */
export function suggestEmailDomain(
  value: string,
  domains: readonly string[] = COMMON_EMAIL_DOMAINS,
): EmailCompletion | null {
  const text = normalizeEmail(value);
  const at = text.lastIndexOf('@');
  if (at < 1) return null;
  const domain = text.slice(at + 1);
  if (domain.length > MAX_SUGGEST_DOMAIN_LENGTH) return null;
  if (!domain.includes('.') || domains.includes(domain)) return null;
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of domains) {
    const distance = editDistance(domain, candidate);
    if (distance <= 2 && (best === null || distance < best.distance)) best = { domain: candidate, distance };
  }
  return best && { domain: best.domain, email: `${text.slice(0, at)}@${best.domain}` };
}
