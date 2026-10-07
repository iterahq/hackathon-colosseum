import { describe, expect, it } from 'vitest';
import { browserUrl, carriesRefreshToken, displayUrl, entryFromLink, entryPathFor, intakeLink } from './deepLink';
import { DEFAULT_WEB_ORIGIN, navigationDecision } from './origin';

describe('entryPathFor', () => {
  it('keeps the query of a reset link', () => {
    expect(entryPathFor(['auth', 'reset'], { code: 'a1b2' })).toBe('/auth/reset?code=a1b2');
  });
  it('keeps the fragment of the DFL callback, undecoded', () => {
    expect(entryPathFor(['auth', 'dfl', 'callback'], { '#': 'dfl_token=a.b.c&next=%2Fprogram%2Fx' })).toBe(
      '/auth/dfl/callback#dfl_token=a.b.c&next=%2Fprogram%2Fx',
    );
  });
  it('keeps a query and a fragment together, and re-encodes the query', () => {
    expect(entryPathFor(['lesson', 'L1'], { q: 'a b&c', '#': 'step-2' })).toBe('/lesson/L1?q=a%20b%26c#step-2');
  });
  it('keeps a repeated key repeated', () => {
    expect(entryPathFor(['catalog'], { tag: ['a', 'b'] })).toBe('/catalog?tag=a&tag=b');
  });
  it('opens the root for no segments', () => {
    expect(entryPathFor([], {})).toBe('/');
    expect(entryPathFor([], { ref: 'x' })).toBe('/?ref=x');
  });
  it('drops the router params that are not part of the link', () => {
    expect(entryPathFor(['catalog'], { path: ['catalog'] })).toBe('/catalog');
  });
  it('opens the home route and drops query and fragment for a path that is not a route', () => {
    expect(entryPathFor(['nope'], { code: 'x', '#': 'dfl_token=t' })).toBe('/');
  });
  it('a query key named `path` never changes the route and never throws', () => {
    expect(entryPathFor(['catalog'], { path: 'lesson/x' })).toBe('/catalog');
    expect(entryPathFor(['catalog'], { path: ['lesson', 'x'] })).toBe('/catalog');
    expect(entryPathFor([], { path: 'catalog' })).toBe('/');
    expect(entryPathFor([], { path: ['admin'], ref: 'x' })).toBe('/?ref=x');
  });
  it('a query key named `#` is the router\'s fragment slot: same page, never another route, never a throw', () => {
    expect(entryPathFor(['catalog'], { '#': 'a' })).toBe('/catalog#a');
    expect(entryPathFor(['catalog'], { '#': ['a', 'b'] })).toBe('/catalog');
    expect(entryPathFor(['catalog'], { '#': '/admin' })).toBe('/catalog#/admin');
    expect(() => entryPathFor(['auth', 'reset'], { '#': undefined, code: 'c' })).not.toThrow();
  });
  it('an empty fragment adds nothing', () => {
    expect(entryPathFor(['catalog'], { '#': '' })).toBe('/catalog');
  });
  it('the URL the WebView starts on stays on the app origin and is a load for navigationDecision', () => {
    const url = DEFAULT_WEB_ORIGIN + entryPathFor(['auth', 'dfl', 'callback'], { '#': 'dfl_token=t&next=/' });
    expect(url).toBe('https://app.iterahq.dev/auth/dfl/callback#dfl_token=t&next=/');
    expect(navigationDecision(url, DEFAULT_WEB_ORIGIN)).toBe('load');
  });
  it('a hostile fragment or query cannot change the origin', () => {
    const url = DEFAULT_WEB_ORIGIN + entryPathFor(['catalog'], { next: '//evil.tld', '#': '@evil.tld/' });
    expect(new URL(url).origin).toBe(DEFAULT_WEB_ORIGIN);
  });
});

describe('displayUrl', () => {
  it('shows a marker, never the value', () => {
    expect(displayUrl('https://app.iterahq.dev/auth/reset?code=SECRET')).toBe('https://app.iterahq.dev/auth/reset?…');
    expect(displayUrl('https://app.iterahq.dev/auth/dfl/callback#dfl_token=SECRET&next=/')).toBe('https://app.iterahq.dev/auth/dfl/callback#…');
    expect(displayUrl('https://app.iterahq.dev/catalog?x=1#SECRET')).not.toMatch(/SECRET|x=1/);
  });
  it('leaves a plain URL alone', () => {
    expect(displayUrl('https://app.iterahq.dev/catalog')).toBe('https://app.iterahq.dev/catalog');
  });
});

describe('browserUrl', () => {
  it('strips query and fragment of an /auth/ page', () => {
    expect(browserUrl('https://app.iterahq.dev/auth/reset?code=S')).toBe('https://app.iterahq.dev/auth/reset');
    expect(browserUrl('https://app.iterahq.dev/auth/dfl/callback#dfl_token=S')).toBe('https://app.iterahq.dev/auth/dfl/callback');
  });
  it('keeps the rest', () => {
    expect(browserUrl('https://app.iterahq.dev/lesson/1?x=2#y')).toBe('https://app.iterahq.dev/lesson/1?x=2#y');
    expect(browserUrl('https://app.iterahq.dev/authors?x=2')).toBe('https://app.iterahq.dev/authors?x=2');
  });
});

describe('entryFromLink (the raw link, byte for byte)', () => {
  const O = DEFAULT_WEB_ORIGIN;
  const from = (link: string | null, segments: string[], params = {}) => entryFromLink(link, O, segments, params);

  it.each([
    ['%2F', `${O}/lesson/L1?next=%2Fcatalog`],
    ['%252F (not decoded twice)', `${O}/lesson/L1?next=%252Fcatalog`],
    ['%26', `${O}/lesson/L1?q=a%26b&r=1`],
    ['+', `${O}/lesson/L1?q=a+b`],
    ['repeated keys', `${O}/lesson/L1?tag=a&tag=b&tag=a`],
    ['an empty value and a bare key', `${O}/lesson/L1?a=&b`],
    ['key order', `${O}/lesson/L1?z=1&a=2`],
  ])('keeps the query as written: %s', (_name, link) => {
    expect(from(link, ['lesson', 'L1'], { decoded: 'ignored' })).toBe(link.slice(O.length));
  });

  it('keeps the fragment as written, with its encoded next', () => {
    const link = `${O}/auth/dfl/callback#dfl_token=a.b.c&next=%2Fprogram%2Fx`;
    expect(from(link, ['auth', 'dfl', 'callback'], { '#': 'dfl_token=a.b.c&next=/program/x' })).toBe(link.slice(O.length));
  });

  it('keeps a query and a fragment together', () => {
    expect(from(`${O}/catalog?x=%252F#y%26z`, ['catalog'])).toBe('/catalog?x=%252F#y%26z');
  });

  it('uses the canonical path of the route, not the link\'s spelling', () => {
    expect(from(`${O}/catalog/?x=1`, ['catalog'])).toBe('/catalog?x=1');
  });

  it('falls back to the params for no link, another origin, another path, a non-https link and Expo Go', () => {
    const params = { x: '1' };
    expect(from(null, ['catalog'], params)).toBe('/catalog?x=1');
    expect(from('https://evil.tld/catalog?y=2', ['catalog'], params)).toBe('/catalog?x=1');
    expect(from(`${O}/lesson/L1?y=2`, ['catalog'], params)).toBe('/catalog?x=1');
    expect(from('http://app.iterahq.dev/catalog?y=2', ['catalog'], params)).toBe('/catalog?x=1');
    expect(from('exp://192.168.1.2:8081/--/catalog?y=2', ['catalog'], params)).toBe('/catalog?x=1');
    expect(from(`${O}@evil.tld/catalog?y=2`, ['catalog'], params)).toBe('/catalog?x=1');
  });

  it('a path that is not a route opens home with no query or fragment', () => {
    expect(from(`${O}/nope?x=1#y`, ['nope'])).toBe('/');
  });

  it('an empty ? or # adds nothing', () => {
    expect(from(`${O}/catalog?#`, ['catalog'])).toBe('/catalog');
  });

  it('drops a query or fragment that carries a refresh_token, whole', () => {
    expect(from(`${O}/#access_token=a&refresh_token=r&type=recovery`, [])).toBe('/');
    expect(from(`${O}/auth/reset#access_token=a&refresh_token=r`, ['auth', 'reset'])).toBe('/auth/reset');
    expect(from(`${O}/catalog?refresh_token=r&x=1#keep`, ['catalog'])).toBe('/catalog#keep');
    expect(from(`${O}/catalog?x=1#a=1&Refresh_Token=r`, ['catalog'])).toBe('/catalog?x=1');
    expect(from(`${O}/catalog?x=1#a=1&refresh%5Ftoken=r`, ['catalog'])).toBe('/catalog?x=1');
  });
});

describe('refresh_token never passes through the params fallback either', () => {
  it('drops the whole query and the whole fragment', () => {
    expect(entryPathFor([], { refresh_token: 'r', access_token: 'a' })).toBe('/');
    expect(entryPathFor([], { '#': 'access_token=a&refresh_token=r&type=recovery' })).toBe('/');
    expect(entryPathFor(['auth', 'reset'], { '#': 'access_token=a&refresh_token=r' })).toBe('/auth/reset');
    expect(entryPathFor(['catalog'], { x: '1', '#': 'ok' })).toBe('/catalog?x=1#ok');
  });
});

describe('carriesRefreshToken', () => {
  it('reads names, not values', () => {
    expect(carriesRefreshToken('#a=1&refresh_token=x')).toBe(true);
    expect(carriesRefreshToken('?REFRESH_TOKEN=x')).toBe(true);
    expect(carriesRefreshToken('a=refresh_token')).toBe(false);
    expect(carriesRefreshToken('not_refresh_token=1')).toBe(false);
    expect(carriesRefreshToken('')).toBe(false);
  });
});

describe('intakeLink (ADR-10 at the intake)', () => {
  const T = 'access_token=AAA&refresh_token=RRR&type=recovery';
  it.each([
    ['a full https link', `https://app.iterahq.dev/#${T}`, 'https://app.iterahq.dev/'],
    ['a full https link on a path, with a query', `https://app.iterahq.dev/auth/reset?x=1#${T}`, 'https://app.iterahq.dev/auth/reset'],
    ['the bare path form', `/#${T}`, '/'],
    ['the bare path form on a path', `/auth/reset#${T}`, '/auth/reset'],
    ['an exp:// link', `exp://192.168.1.2:8081/--/auth/reset#${T}`, 'exp://192.168.1.2:8081/--/auth/reset'],
    ['REFRESH_TOKEN', `https://app.iterahq.dev/#a=1&REFRESH_TOKEN=RRR`, 'https://app.iterahq.dev/'],
    ['a percent-encoded name', `https://app.iterahq.dev/#a=1&refresh%5Ftoken=RRR`, 'https://app.iterahq.dev/'],
    ['a double-encoded name', `https://app.iterahq.dev/?refresh%255Ftoken=RRR`, 'https://app.iterahq.dev/'],
    ['a refresh_token in the query', `https://app.iterahq.dev/catalog?refresh_token=RRR&x=1`, 'https://app.iterahq.dev/catalog'],
    ['a refresh_token nested in the fragment', `https://app.iterahq.dev/#/x?refresh_token=RRR`, 'https://app.iterahq.dev/'],
  ])('strips query and fragment, and remembers only the stripped form: %s', (_name, link, want) => {
    const out = intakeLink(link);
    expect(out).toEqual({ path: want, remember: want });
    expect(`${out.path}${out.remember}`).not.toMatch(/RRR|AAA|refresh/i);
  });

  it.each([
    'https://app.iterahq.dev/auth/dfl/callback#dfl_token=a.b.c&next=%2Fx',
    '/catalog?x=%252F#y',
    'https://app.iterahq.dev/lesson/1',
    'exp://192.168.1.2:8081/--/catalog?a=1',
    '',
  ])('passes any other link unchanged: %s', (link) => {
    expect(intakeLink(link)).toEqual({ path: link, remember: link });
  });

  it('a refresh_token in the path itself gives the home path and remembers nothing', () => {
    expect(intakeLink('https://app.iterahq.dev/refresh_token')).toEqual({ path: '/', remember: null });
  });

  it.each([undefined, null, 42, {}, ['a'], Symbol('x')])('garbage input (%s) never throws, remembers nothing, gives /', (garbage) => {
    expect(intakeLink(garbage)).toEqual({ path: '/', remember: null });
  });

  it('never throws on a string with lone surrogates or NULs', () => {
    expect(() => intakeLink('\ud800/\u0000?x=%E0%A4%A#%')).not.toThrow();
    expect(intakeLink('\ud800/#%').remember).not.toBeNull();
  });

  it('a path through the unreadable branch with the text in any casing is `/`', () => {
    const hostile = { toString: () => 'x' } as unknown;
    expect(intakeLink(hostile)).toEqual({ path: '/', remember: null });
  });
});
