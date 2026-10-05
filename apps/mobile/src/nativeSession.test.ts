import { describe, expect, it } from 'vitest';
import { ISSUER, NOW, OTHER_USER, PROJECT, USER, fakeJwt } from './jwt.testkit';
import { createNativeSession, issuerOf, sessionLine, sessionStatusLine, tokenShapeProblem } from './nativeSession';

const EXPIRES_AT = 2_000_000_000_000;

describe('tokenShapeProblem', () => {
  it('accepts a token of the project: three parts, a uuid sub, the authenticated audience, the issuer', () => {
    expect(tokenShapeProblem(fakeJwt(), ISSUER)).toBeNull();
    expect(tokenShapeProblem(fakeJwt({ aud: ['authenticated'] }), ISSUER)).toBeNull();
    expect(issuerOf(PROJECT)).toBe(ISSUER);
  });

  it('never skips the issuer check: with no issuer to compare, every token is refused', () => {
    expect(tokenShapeProblem(fakeJwt(), '')).toBe('iss');
    expect(tokenShapeProblem(fakeJwt({ iss: '' }), '')).toBe('iss');
    expect(tokenShapeProblem(fakeJwt({ iss: undefined }), '')).toBe('iss');
  });

  it.each([
    ['not a string', 42, 'accessToken'],
    ['two parts', 'eyJh.eyJz', 'accessToken'],
    ['four parts', `${fakeJwt()}.x`, 'accessToken'],
    ['a payload that is not JSON', 'eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24.c2ln', 'accessToken'],
    ['no exp', fakeJwt({ exp: undefined }), 'accessToken'],
    ['a sub that is no uuid', fakeJwt({ sub: 'service_role' }), 'sub'],
    ['the anon audience', fakeJwt({ aud: 'anon' }), 'aud'],
    ['no audience', fakeJwt({ aud: undefined }), 'aud'],
    ['another project', fakeJwt({ iss: 'https://other.supabase.co/auth/v1' }), 'iss'],
    ['the project with a suffix', fakeJwt({ iss: `${ISSUER}/` }), 'iss'],
    ['no issuer', fakeJwt({ iss: undefined }), 'iss'],
    ['a guest of a live class', fakeJwt({ app_metadata: { is_guest: true } }), 'guest'],
  ])('names the failing part of %s, never a value', (_what, token, problem) => {
    expect(tokenShapeProblem(token, ISSUER)).toBe(problem);
  });
});

describe('createNativeSession', () => {
  const make = (now = NOW) => {
    let t = now;
    const native = createNativeSession({ issuer: ISSUER, now: () => t, askTimeoutMs: 10 });
    return { native, setNow: (v: number) => (t = v) };
  };
  const JWT = fakeJwt();

  it('holds the user id, the access token and the expiry, and nothing else', () => {
    const { native } = make();
    expect(native.handlerFor('a')({ accessToken: JWT, expiresAt: EXPIRES_AT })).toEqual({ stored: true });
    const held = native.session.current();
    expect(held).toEqual({ userId: USER, accessToken: JWT, expiresAt: EXPIRES_AT });
    expect(Object.keys(held ?? {}).sort()).toEqual(['accessToken', 'expiresAt', 'userId']);
  });

  it('an expired copy is absent: current() is null and getAccessToken asks the page, never refreshes by itself', async () => {
    const { native, setNow } = make();
    native.handlerFor('a')({ accessToken: JWT, expiresAt: EXPIRES_AT });
    const asks: boolean[] = [];
    native.bindAsk((forceRefresh) => (asks.push(forceRefresh), true));
    setNow(EXPIRES_AT - 30_000);
    expect(await native.session.getAccessToken()).toBeNull();
    expect(asks).toEqual([false]);
    setNow(EXPIRES_AT + 1);
    expect(native.session.current()).toBeNull();
  });

  it('inside the last minute the copy is not given out: the page is asked, and its fresh token is returned', async () => {
    const { native, setNow } = make();
    const handler = native.handlerFor('a');
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    setNow(EXPIRES_AT - 30_000);
    const fresh = fakeJwt({ exp: 2_000_003_600 });
    native.bindAsk(() => {
      setTimeout(() => handler({ accessToken: fresh, expiresAt: 2_000_003_600_000 }), 0);
      return true;
    });
    expect(await native.session.getAccessToken()).toBe(fresh);
  });

  it('with no page to ask, getAccessToken is null', async () => {
    const { native } = make();
    expect(await native.session.getAccessToken()).toBeNull();
  });

  it('a refused token throws with the name of the part and leaves the held copy as it was', () => {
    const { native } = make();
    const handler = native.handlerFor('a');
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    const forged = fakeJwt({ sub: OTHER_USER, iss: 'https://other.supabase.co/auth/v1' });
    expect(() => handler({ accessToken: forged, expiresAt: EXPIRES_AT })).toThrow(/^bad payload: iss$/);
    expect(native.session.current()).toMatchObject({ userId: USER });
  });

  it('release(owner) drops the copy that owner delivered and tells the listeners; another owner changes nothing', () => {
    const { native } = make();
    const events: string[] = [];
    native.session.subscribe((e) => void events.push(e.type));
    native.handlerFor('a')({ accessToken: JWT, expiresAt: EXPIRES_AT });
    native.release('b');
    expect(native.session.current()).not.toBeNull();
    native.release('a');
    expect(native.session.current()).toBeNull();
    native.release('a');
    expect(events).toEqual(['signed-in', 'signed-out']);
  });

  it('signedOut from any WebView clears the copy, and a later release of the old owner is a no-op', () => {
    const { native } = make();
    const events: string[] = [];
    native.session.subscribe((e) => void events.push(e.type));
    native.handlerFor('a')({ accessToken: JWT, expiresAt: EXPIRES_AT });
    expect(native.handlerFor('b')({ signedOut: true })).toEqual({ stored: false });
    native.release('a');
    expect(native.session.current()).toBeNull();
    expect(events).toEqual(['signed-in', 'signed-out']);
  });

  it('the held token is a router secret, also after it expired', () => {
    const { native, setNow } = make();
    native.handlerFor('a')({ accessToken: JWT, expiresAt: EXPIRES_AT });
    setNow(EXPIRES_AT + 1);
    expect(native.session.secrets()).toEqual([JWT]);
  });
});

describe('revalidate (the app returns to the foreground)', () => {
  const JWT = fakeJwt();
  const make = () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const native = createNativeSession({ issuer: ISSUER, now: () => NOW, graceMs: 5000, setTimer: (fn, ms) => timers.push({ fn, ms }), clearTimer: () => undefined });
    const events: string[] = [];
    native.session.subscribe((e) => void events.push(e.type));
    return { native, timers, events, handler: native.handlerFor('a') };
  };

  it('with no copy it asks nobody and starts no timer', () => {
    const { native, timers } = make();
    const asks: boolean[] = [];
    native.bindAsk((force) => (asks.push(force), true));
    native.revalidate();
    expect(asks).toEqual([]);
    expect(timers).toEqual([]);
  });

  it('asks the page once, without forcing a refresh, and drops the copy when nothing is pushed within the grace', () => {
    const { native, timers, events, handler } = make();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    const asks: boolean[] = [];
    native.bindAsk((force) => (asks.push(force), true));
    native.revalidate();
    expect(asks).toEqual([false]);
    expect(timers.map((t) => t.ms)).toEqual([5000]);
    expect(native.session.current()).not.toBeNull();
    timers[0].fn();
    expect(native.session.current()).toBeNull();
    expect(events).toEqual(['signed-in', 'signed-out']);
  });

  it('keeps the copy when the page pushes its token inside the grace', () => {
    const { native, timers, handler } = make();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    native.bindAsk(() => true);
    native.revalidate();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    timers[0].fn();
    expect(native.session.current()).toMatchObject({ userId: USER });
  });

  it('the lost sign-out arrives as the answer: the copy ends at once', () => {
    const { native, timers, handler } = make();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    native.bindAsk(() => (handler({ signedOut: true }), true));
    native.revalidate();
    expect(native.session.current()).toBeNull();
    timers[0].fn();
    expect(native.session.current()).toBeNull();
  });

  it('a refused push is not a voucher: the copy is still dropped', () => {
    const { native, timers, handler } = make();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    native.bindAsk(() => true);
    native.revalidate();
    expect(() => handler({ accessToken: fakeJwt({ iss: 'https://other.supabase.co/auth/v1' }), expiresAt: EXPIRES_AT })).toThrow();
    timers[0].fn();
    expect(native.session.current()).toBeNull();
  });

  it('with no page to ask (no WebView bound, or no handshake) the copy is dropped at once', () => {
    const a = make();
    a.handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    a.native.revalidate();
    expect(a.native.session.current()).toBeNull();
    const b = make();
    b.handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    const unbind = b.native.bindAsk(() => false);
    b.native.revalidate();
    expect(b.native.session.current()).toBeNull();
    expect(b.timers).toEqual([]);
    unbind();
  });
});

describe('two mounted WebViews (a deep link over an open route)', () => {
  const JWT = fakeJwt();
  const make = () => {
    const timers: Array<() => void> = [];
    const native = createNativeSession({ issuer: ISSUER, now: () => NOW, askTimeoutMs: 10, setTimer: (fn) => timers.push(fn), clearTimer: () => undefined });
    return { native, timers, handler: native.handlerFor('lower') };
  };

  it('the one bound last is asked', () => {
    const { native, handler } = make();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    const asked: string[] = [];
    native.bindAsk(() => (asked.push('lower'), true));
    native.bindAsk(() => (asked.push('upper'), true));
    native.revalidate();
    expect(asked).toEqual(['upper']);
  });

  it('when the upper one unmounts the lower one is asked again: the copy is not dropped for want of a page', () => {
    const { native, timers, handler } = make();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    const asked: string[] = [];
    native.bindAsk(() => (asked.push('lower'), true));
    const unbindUpper = native.bindAsk(() => (asked.push('upper'), true));
    unbindUpper();
    native.revalidate();
    expect(asked).toEqual(['lower']);
    expect(native.session.current()).not.toBeNull();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    for (const fire of timers) fire();
    expect(native.session.current()).toMatchObject({ userId: USER });
  });

  it('getAccessToken asks the lower one too, once the upper one is gone', async () => {
    const { native, timers } = make();
    const asked: string[] = [];
    native.bindAsk(() => (asked.push('lower'), true));
    native.bindAsk(() => (asked.push('upper'), true))();
    const token = native.session.getAccessToken();
    for (const fire of timers) fire();
    expect(await token).toBeNull();
    expect(asked).toEqual(['lower']);
  });

  it('the lower one unmounting first leaves the upper one bound, and the last unbind leaves nobody', () => {
    const { native, handler } = make();
    handler({ accessToken: JWT, expiresAt: EXPIRES_AT });
    const asked: string[] = [];
    const unbindLower = native.bindAsk(() => (asked.push('lower'), true));
    const unbindUpper = native.bindAsk(() => (asked.push('upper'), true));
    unbindLower();
    native.revalidate();
    expect(asked).toEqual(['upper']);
    unbindUpper();
    unbindUpper();
    native.revalidate();
    expect(asked).toEqual(['upper']);
    expect(native.session.current()).toBeNull();
  });
});

describe('sessionStatusLine', () => {
  it('before any handshake and after one that offered the session it is the session line', () => {
    expect(sessionStatusLine(null, true, null, NOW)).toBe('Sessão: não');
    expect(sessionStatusLine(true, true, NOW + 10 * 60_000, NOW)).toBe('Sessão: sim (expira em 10 min)');
  });
  it('a handshake that did not offer it says why: no backend in the build, or a sender the WebView cannot attribute', () => {
    expect(sessionStatusLine(false, false, null, NOW)).toBe('Sessão: não oferecida (build sem backend)');
    expect(sessionStatusLine(false, true, NOW + 60_000, NOW)).toBe('Sessão: não oferecida (este WebView não informa o frame)');
  });
});

describe('sessionLine', () => {
  it('says yes with whole minutes left, or no; never the token', () => {
    expect(sessionLine(null, NOW)).toBe('Sessão: não');
    expect(sessionLine({ expiresAt: NOW + 59 * 60_000 + 59_000 }, NOW)).toBe('Sessão: sim (expira em 59 min)');
    expect(sessionLine({ expiresAt: NOW - 5 }, NOW)).toBe('Sessão: sim (expira em 0 min)');
    const held = { userId: USER, accessToken: fakeJwt(), expiresAt: EXPIRES_AT };
    expect(sessionLine(held, NOW)).not.toMatch(/eyJ|5b0f7c3e/);
  });
});
