import { describe, expect, it } from 'vitest';
import { emailDomainCompletions, normalizeEmail, suggestEmailDomain } from './index';

describe('normalizeEmail', () => {
  it('trims, removes inner whitespace and lowercases only the domain', () => {
    expect(normalizeEmail(' Ada@Gmail.COM ')).toBe('Ada@gmail.com');
    expect(normalizeEmail('ada@ gmail.com')).toBe('ada@gmail.com');
    expect(normalizeEmail('Ada')).toBe('Ada');
  });
});

describe('emailDomainCompletions', () => {
  it('offers every domain before an @', () => {
    expect(emailDomainCompletions('ada').map((c) => c.email)).toEqual([
      'ada@gmail.com',
      'ada@icloud.com',
      'ada@outlook.com',
    ]);
  });
  it('filters by the typed fragment and skips exact matches', () => {
    expect(emailDomainCompletions('ada@gm')).toEqual([{ domain: 'gmail.com', email: 'ada@gmail.com' }]);
    expect(emailDomainCompletions('ada@gmail.com')).toEqual([]);
  });
  it('offers nothing without a local part', () => {
    expect(emailDomainCompletions('')).toEqual([]);
    expect(emailDomainCompletions('@gm')).toEqual([]);
  });
});

describe('suggestEmailDomain', () => {
  it('gives no suggestion for a domain longer than 64 characters', () => {
    const long = `${'a'.repeat(70)}.com`;
    expect(suggestEmailDomain(`x@${long.replace('com', 'con')}`, [long])).toBeNull();
    expect(suggestEmailDomain('x@aaaa.con', ['aaaa.com'])?.domain).toBe('aaaa.com');
    expect(suggestEmailDomain(`bob@gmial.com${'.x'.repeat(30)}`)).toBeNull();
  });
  it.each([
    ['bob@gmial.com', 'bob@gmail.com'],
    ['bob@gmail.con', 'bob@gmail.com'],
    ['bob@outlok.com', 'bob@outlook.com'],
    ['bob@icloud.co', 'bob@icloud.com'],
  ])('fixes %s', (input, expected) => {
    expect(suggestEmailDomain(input)?.email).toBe(expected);
  });
  it('stays quiet for known, unrelated or incomplete domains', () => {
    expect(suggestEmailDomain('bob@gmail.com')).toBeNull();
    expect(suggestEmailDomain('bob@company.io')).toBeNull();
    expect(suggestEmailDomain('bob@gmial')).toBeNull();
    expect(suggestEmailDomain('bob')).toBeNull();
  });
});
