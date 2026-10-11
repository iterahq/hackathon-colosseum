import { describe, expect, it } from 'vitest';
import { checkLink, checkableUrl, linkVerdict } from './link-check';

describe('checkableUrl', () => {
  it('takes a public https address', () => {
    expect(checkableUrl('https://codepen.io/someone/pen/abc')?.hostname).toBe('codepen.io');
  });

  it.each([
    'http://codepen.io/x',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://10.0.0.8/x',
    'https://[::1]/x',
    'https://169.254.169.254/latest/meta-data',
    'https://intranet/x',
    'https://db.internal/x',
    'https://printer.local/x',
    'https://user:pass@codepen.io/x',
    'https://codepen.io:8443/x',
    'ftp://codepen.io/x',
    'not a url',
    '',
  ])('refuses %s', (raw) => {
    expect(checkableUrl(raw)).toBeNull();
  });
});

describe('linkVerdict', () => {
  it('reads the status class and claims nothing it does not know', () => {
    expect(linkVerdict(200)).toBe('opens');
    expect(linkVerdict(302)).toBe('opens');
    expect(linkVerdict(404)).toBe('not_found');
    expect(linkVerdict(410)).toBe('not_found');
    expect(linkVerdict(403)).toBe('unconfirmed');
    expect(linkVerdict(500)).toBe('unconfirmed');
    expect(linkVerdict(null)).toBe('unconfirmed');
  });
});

describe('checkLink', () => {
  it('asks once, follows no redirect and returns only the status', async () => {
    const seen: RequestInit[] = [];
    const answer = await checkLink('https://codepen.io/nobody/pen/none', 1000, async (_url, init) => {
      seen.push(init);
      return new Response('secret page', { status: 404, headers: { 'x-secret': '1' } });
    });
    expect(answer).toEqual({ verdict: 'not_found', status: 404 });
    expect(seen).toHaveLength(1);
    expect(seen[0].redirect).toBe('manual');
  });

  it('does not ask a private address at all', async () => {
    let asked = 0;
    const answer = await checkLink('https://169.254.169.254/latest', 1000, async () => {
      asked += 1;
      return new Response('', { status: 200 });
    });
    expect(answer).toBeNull();
    expect(asked).toBe(0);
  });

  it('says unconfirmed when the address does not answer', async () => {
    expect(await checkLink('https://example.com/x', 1000, async () => Promise.reject(new Error('down')))).toEqual({ verdict: 'unconfirmed', status: null });
  });
});
