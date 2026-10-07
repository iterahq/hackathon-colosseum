import { describe, expect, it } from 'vitest';
import { isCallbackEntry } from './deepLink';
import { AUTH_BUSY_NOTICE, RETURN_MARKER_TTL_MS, SESSION_STALE_MS, acceptAuthSessionReturn, authSessionEnabled, createReturnLatch, createSessionGuard } from './dflAuthSession';

const APP = 'https://app.iterahq.dev';
const OK = 'https://app.iterahq.dev/auth/dfl/callback#dfl_token=a.b.c&next=%2Fprogram%2Fx';
const ok = (url: unknown, type = 'success') => acceptAuthSessionReturn({ type, url }, APP);

describe('authSessionEnabled', () => {
  it('is off in Expo Go, on in every installed build', () => {
    expect(authSessionEnabled('storeClient')).toBe(false);
    expect(authSessionEnabled('standalone')).toBe(true);
    expect(authSessionEnabled('bare')).toBe(true);
    expect(authSessionEnabled(null)).toBe(true);
    expect(authSessionEnabled(undefined)).toBe(true);
  });
});

describe('acceptAuthSessionReturn', () => {
  it('returns the URL unchanged, fragment included', () => {
    expect(ok(OK)).toBe(OK);
    expect(ok('https://app.iterahq.dev/auth/dfl/callback')).toBe('https://app.iterahq.dev/auth/dfl/callback');
    expect(ok('https://app.iterahq.dev/auth/dfl/callback?x=1#dfl_token=t')).toBe('https://app.iterahq.dev/auth/dfl/callback?x=1#dfl_token=t');
    expect(ok('HTTPS://APP.ITERAHQ.DEV/auth/dfl/callback#dfl_token=t')).toBe('HTTPS://APP.ITERAHQ.DEV/auth/dfl/callback#dfl_token=t');
  });

  it.each(['cancel', 'dismiss', 'locked', 'opened', ''])('drops %s', (type) => {
    expect(ok(OK, type)).toBeNull();
  });

  it('drops a success with no URL or a URL that is not a string', () => {
    expect(ok(undefined)).toBeNull();
    expect(ok(null)).toBeNull();
    expect(ok(42)).toBeNull();
    expect(ok({})).toBeNull();
  });

  it.each([
    ['another host', 'https://learn.devfellowship.com/auth/dfl/callback#dfl_token=t'],
    ['a look-alike host', 'https://app.iterahq.dev.evil.tld/auth/dfl/callback#dfl_token=t'],
    ['a subdomain', 'https://x.app.iterahq.dev/auth/dfl/callback#dfl_token=t'],
    ['userinfo', 'https://app.iterahq.dev@evil.tld/auth/dfl/callback#dfl_token=t'],
    ['userinfo, app host after', 'https://evil.tld@app.iterahq.dev/auth/dfl/callback#dfl_token=t'],
    ['backslash authority', 'https://evil.tld\\@app.iterahq.dev/auth/dfl/callback'],
    ['http', 'http://app.iterahq.dev/auth/dfl/callback#dfl_token=t'],
    ['a port', 'https://app.iterahq.dev:8443/auth/dfl/callback#dfl_token=t'],
    ['a trailing dot', 'https://app.iterahq.dev./auth/dfl/callback#dfl_token=t'],
    ['the custom scheme', 'itera://auth/dfl/callback#dfl_token=t'],
    ['exp://', 'exp://192.168.1.2:8081/--/auth/dfl/callback#dfl_token=t'],
    ['another path', 'https://app.iterahq.dev/auth/reset#dfl_token=t'],
    ['a longer path', 'https://app.iterahq.dev/auth/dfl/callback/x#dfl_token=t'],
    ['a trailing slash', 'https://app.iterahq.dev/auth/dfl/callback/#dfl_token=t'],
    ['another case of the path', 'https://app.iterahq.dev/Auth/dfl/callback#dfl_token=t'],
    ['the path only in the fragment', 'https://app.iterahq.dev/#/auth/dfl/callback'],
    ['the path only in the query', 'https://app.iterahq.dev/?x=/auth/dfl/callback'],
    ['the root', 'https://app.iterahq.dev/'],
    ['no authority', 'https:/auth/dfl/callback'],
    ['leading whitespace', ` ${OK}`],
    ['trailing whitespace', `${OK} `],
    ['javascript:', 'javascript:alert(1)'],
    ['an empty string', ''],
  ])('drops %s', (_name, url) => {
    expect(ok(url)).toBeNull();
  });

  it('drops everything for an app origin that is not https', () => {
    expect(acceptAuthSessionReturn({ type: 'success', url: 'http://app.iterahq.dev/auth/dfl/callback' }, 'http://app.iterahq.dev')).toBeNull();
  });
});

describe('createSessionGuard', () => {
  const make = () => {
    const clock = { t: 1000 };
    return { clock, guard: createSessionGuard(() => clock.t) };
  };

  it('lets one session in, refuses a second tap, and lets the next in after leave', () => {
    const { guard } = make();
    const first = guard.tryEnter();
    expect(first).not.toBeNull();
    expect(guard.tryEnter()).toBeNull();
    expect(guard.tryEnter()).toBeNull();
    expect(guard.leave(first as number)).toBe(true);
    expect(guard.tryEnter()).not.toBeNull();
  });

  it('a leave with a ticket that is not the current one releases nothing', () => {
    const { guard } = make();
    expect(guard.leave(7)).toBe(false);
    expect(guard.tryEnter()).not.toBeNull();
  });

  it('a session that never settled is released by the next tap after the stale period', () => {
    const { clock, guard } = make();
    const dead = guard.tryEnter() as number;
    clock.t += SESSION_STALE_MS;
    expect(guard.tryEnter()).toBeNull();
    clock.t += 1;
    const fresh = guard.tryEnter();
    expect(fresh).not.toBeNull();
    expect(guard.tryEnter()).toBeNull();
    // the dead session settling late must not close the new one
    expect(guard.leave(dead)).toBe(false);
    expect(guard.tryEnter()).toBeNull();
    expect(guard.leave(fresh as number)).toBe(true);
  });

  it('has a notice for the refused tap', () => {
    expect(AUTH_BUSY_NOTICE.length).toBeGreaterThan(0);
  });
});

describe('createReturnLatch (Android: the return link arrives twice)', () => {
  const make = () => {
    const clock = { t: 1000 };
    return { clock, latch: createReturnLatch(() => clock.t) };
  };

  it('router first: one load, the session copy is a duplicate', () => {
    const { latch } = make();
    latch.begin();
    expect(latch.arrive('router')).toBe('load');
    expect(latch.arrive('session')).toBe('duplicate');
  });

  it('session first: one load, the router copy is a duplicate even after the session ended', () => {
    const { latch } = make();
    latch.begin();
    expect(latch.arrive('session')).toBe('load');
    latch.end();
    expect(latch.arrive('router')).toBe('duplicate');
  });

  it('the two copies are not compared: a router copy that is the decoded form of the session copy is still the same return', () => {
    // the router hands the page `next=/program/x`, the session `next=%2Fprogram%2Fx`: different strings, one return
    const { latch } = make();
    latch.begin();
    expect(latch.arrive('session')).toBe('load');
    expect(latch.arrive('router')).toBe('duplicate');
  });

  it('the marker is consumed: a third arrival loads again', () => {
    const { latch } = make();
    latch.begin();
    latch.arrive('router');
    latch.arrive('session');
    expect(latch.arrive('session')).toBe('load');
  });

  it('iOS: only the session arrives, and it loads', () => {
    const { latch } = make();
    latch.begin();
    expect(latch.arrive('session')).toBe('load');
    latch.end();
  });

  it('a router-set marker dies with the session (a cancelled or dismissed session leaves nothing)', () => {
    const { latch } = make();
    latch.begin();
    expect(latch.arrive('router')).toBe('load');
    latch.end();
    expect(latch.arrive('session')).toBe('load');
  });

  it('a callback link opened from outside, with no session, always loads and leaves no marker', () => {
    const { latch } = make();
    expect(latch.arrive('router')).toBe('load');
    expect(latch.arrive('router')).toBe('load');
    expect(latch.arrive('session')).toBe('load');
  });

  it('a session-set marker expires', () => {
    const { clock, latch } = make();
    latch.begin();
    latch.arrive('session');
    latch.end();
    clock.t += RETURN_MARKER_TTL_MS + 1;
    expect(latch.arrive('router')).toBe('load');
  });

  it('a new session drops the marker of the last one', () => {
    const { latch } = make();
    latch.begin();
    latch.arrive('session');
    latch.end();
    latch.begin();
    expect(latch.arrive('router')).toBe('load');
  });

  it('holds nothing of the link', () => {
    const { latch } = make();
    latch.begin();
    latch.arrive('session');
    expect(Object.keys(latch).sort()).toEqual(['arrive', 'begin', 'end']);
  });
});

describe('the raw callback link is consumed in either Android order', () => {
  const O = 'https://app.iterahq.dev';
  const rawCallback = '/auth/dfl/callback#dfl_token=a.b.c';

  // The route's rule: the effect looks at the RAW entry; the latch only picks which entry is effective.
  const route = (order: ('session' | 'router')[]) => {
    const latch = createReturnLatch(() => 0);
    latch.begin();
    let effective = '/login';
    for (const source of order) {
      const arrival = latch.arrive(source);
      const returned = acceptAuthSessionReturn({ type: 'success', url: O + rawCallback }, O);
      if (source === 'router' && returned !== null && arrival === 'load') effective = rawCallback;
    }
    return { effective, forget: isCallbackEntry(rawCallback) };
  };

  it('router first: the router\'s copy loads, and the link is forgotten', () => {
    expect(route(['router', 'session'])).toEqual({ effective: rawCallback, forget: true });
  });

  it('session first: the router\'s copy is a duplicate, the effective entry stays /login, and the link is forgotten all the same', () => {
    const out = route(['session', 'router']);
    expect(out.effective).toBe('/login');
    expect(isCallbackEntry(out.effective)).toBe(false);
    expect(out.forget).toBe(true);
  });
});
