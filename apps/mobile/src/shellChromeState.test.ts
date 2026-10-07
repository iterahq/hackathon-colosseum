import { describe, expect, it } from 'vitest';
import { isTopFrameRequest } from './origin';
import {
  INITIAL_CHROME,
  LOAD_TIMEOUT_MS,
  MAX_PROCESS_DEATHS,
  VEIL_FADE_MS,
  blockedNotice,
  cardCopy,
  chromeReducer,
  classifyLoadError,
  isCardVisible,
  isVeilVisible,
  noticeDue,
  LATE_GUARD_ERROR,
  LATE_WINDOW_MS,
  classifyLoadStart,
  createLateGuard,
  MAX_LATE_RECOVERIES,
  NOTICE_GAP_MS,
  restartUrl,
  shouldHandleBack,
  type ChromeEvent,
  type ChromeState,
} from './shellChromeState';

const run = (events: ChromeEvent[], from: ChromeState = INITIAL_CHROME) => events.reduce(chromeReducer, from);
const O = 'https://app.iterahq.dev';

const BLOCKED_NOTICE = 'Indisponível no app';

describe('loading veil', () => {
  it('starts with the veil up and no card', () => {
    expect(isVeilVisible(INITIAL_CHROME)).toBe(true);
    expect(isCardVisible(INITIAL_CHROME)).toBe(false);
  });
  it('a finished load lowers the veil', () => {
    const s = run([{ type: 'loadStart' }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('ready');
    expect(isVeilVisible(s)).toBe(false);
  });
  it('a later full-page navigation raises the veil again with a new load id', () => {
    const ready = run([{ type: 'loadEnd' }]);
    const s = run([{ type: 'loadStart' }], ready);
    expect(s.phase).toBe('loading');
    expect(s.loadId).toBe(ready.loadId + 1);
  });
  it('a second loadStart during a load does not restart the 15 s timer', () => {
    expect(run([{ type: 'loadStart' }, { type: 'loadStart' }]).loadId).toBe(INITIAL_CHROME.loadId);
  });
  it('uses the timings of section 4.1', () => {
    expect(LOAD_TIMEOUT_MS).toBe(15_000);
    expect(VEIL_FADE_MS).toBe(150);
  });
});

describe('15 s timeout', () => {
  it('shows the failure card when the load never finishes', () => {
    const s = run([{ type: 'timeout', loadId: INITIAL_CHROME.loadId }]);
    expect(s.phase).toBe('failed');
    expect(s.failure).toBe('timeout');
  });
  it('a timeout of an earlier load changes nothing', () => {
    const second = run([{ type: 'loadEnd' }, { type: 'loadStart' }]);
    expect(run([{ type: 'timeout', loadId: INITIAL_CHROME.loadId }], second)).toBe(second);
  });
  it('a timeout after the load finished changes nothing', () => {
    const ready = run([{ type: 'loadEnd' }]);
    expect(run([{ type: 'timeout', loadId: ready.loadId }], ready)).toBe(ready);
  });
});

describe('load failure card', () => {
  it('onError shows the generic card', () => {
    const s = run([{ type: 'loadStart' }, { type: 'error', description: 'net::ERR_CONNECTION_REFUSED' }]);
    expect(isCardVisible(s)).toBe(true);
    expect(s.failure).toBe('load');
    expect(cardCopy(s.failure).title).toBe('Não foi possível abrir o Itera');
    expect(cardCopy(s.failure, 'en').title).toBe('Could not open Itera');
  });
  it.each(['net::ERR_INTERNET_DISCONNECTED', 'The Internet connection appears to be offline.', 'You are not connected to the internet'])(
    'onError "%s" shows the "Sem conexão" card',
    (description) => {
      const s = run([{ type: 'error', description }]);
      expect(s.failure).toBe('offline');
      expect(cardCopy(s.failure).title).toBe('Sem conexão');
    },
  );
  it('the offline card never tells the learner to open the browser, in either language', () => {
    for (const locale of ['pt', 'en'] as const) {
      const { title, body } = cardCopy('offline', locale);
      expect(`${title} ${body}`).not.toMatch(/navegador|browser/i);
      expect(body).toMatch(/internet/i);
    }
    expect(cardCopy('timeout', 'pt').body).toMatch(/navegador/);
    expect(cardCopy('http', 'en').body).toMatch(/browser/);
  });
  it.each(['net::ERR_SSL_PROTOCOL_ERROR', 'net::ERR_CONNECTION_REFUSED', ''])('classifies "%s" as a plain load failure', (description) => {
    expect(classifyLoadError({ description })).toBe('load');
  });
  it.each([400, 403, 404, 500, 503])('a page answering %i shows the card, with no URL comparison', (statusCode) => {
    const s = run([{ type: 'loadStart' }, { type: 'httpError', statusCode }]);
    expect(s.phase).toBe('failed');
    expect(s.failure).toBe('http');
  });
  it.each([200, 301, 304, 399])('a status of %i is not an error', (statusCode) => {
    expect(run([{ type: 'httpError', statusCode }]).phase).toBe('loading');
  });
  it('the finish event that follows a failure keeps the card up', () => {
    const s = run([{ type: 'httpError', statusCode: 503 }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('failed');
    expect(run([{ type: 'error', description: 'x' }, { type: 'loadEnd' }]).phase).toBe('failed');
  });
  it('a load that finishes after the 15 s timeout lowers the card', () => {
    const s = run([{ type: 'timeout', loadId: INITIAL_CHROME.loadId }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('ready');
    expect(s.failure).toBeNull();
  });
  it('an error after a timeout still keeps the card up after the finish event', () => {
    const s = run([{ type: 'timeout', loadId: 0 }, { type: 'error', description: 'x' }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('failed');
  });
  it('an error while a page is showing raises the card', () => {
    expect(run([{ type: 'loadEnd' }, { type: 'httpError', statusCode: 500 }]).phase).toBe('failed');
  });
  it('a new navigation (back) from the card goes back to the veil', () => {
    const s = run([{ type: 'error', description: 'x' }, { type: 'loadStart' }]);
    expect(s.phase).toBe('loading');
    expect(s.failure).toBeNull();
  });
});

describe('retry', () => {
  it('re-creates the WebView and raises the veil', () => {
    const card = run([{ type: 'httpError', statusCode: 503 }]);
    const s = run([{ type: 'retry' }], card);
    expect(s.phase).toBe('loading');
    expect(s.failure).toBeNull();
    expect(s.mountKey).toBe(card.mountKey + 1);
    expect(s.loadId).toBe(card.loadId + 1);
  });
  it('does nothing when there is no card', () => {
    const ready = run([{ type: 'loadEnd' }]);
    expect(run([{ type: 'retry' }], ready)).toBe(ready);
  });
  it('a retry that fails again shows the card again', () => {
    const s = run([{ type: 'error', description: 'x' }, { type: 'retry' }, { type: 'error', description: 'x' }]);
    expect(isCardVisible(s)).toBe(true);
  });
  it('a timeout of the failed attempt cannot fail the retry', () => {
    const failedTimeout = run([{ type: 'timeout', loadId: 0 }]);
    const retried = run([{ type: 'retry' }], failedTimeout);
    expect(run([{ type: 'timeout', loadId: failedTimeout.loadId }], retried).phase).toBe('loading');
  });
});

describe('process death (ADR-6, ADR-10)', () => {
  it('re-creates the WebView under the veil', () => {
    const ready = run([{ type: 'loadEnd' }]);
    const s = run([{ type: 'processGone' }], ready);
    expect(s.phase).toBe('loading');
    expect(s.mountKey).toBe(ready.mountKey + 1);
  });
  it('a finished load between deaths resets the count', () => {
    let s = INITIAL_CHROME;
    for (let i = 0; i < 10; i++) s = run([{ type: 'processGone' }, { type: 'loadEnd' }], s);
    expect(s.phase).toBe('ready');
  });
  it(`${MAX_PROCESS_DEATHS} deaths in a row stop the reload loop and show the card`, () => {
    const s = run(Array.from({ length: MAX_PROCESS_DEATHS }, () => ({ type: 'processGone' }) as const));
    expect(s.phase).toBe('failed');
    expect(s.failure).toBe('process');
  });
  it('Retry after that card starts over with a clean count', () => {
    const dead = run(Array.from({ length: MAX_PROCESS_DEATHS }, () => ({ type: 'processGone' }) as const));
    const s = run([{ type: 'retry' }, { type: 'processGone' }], dead);
    expect(s.phase).toBe('loading');
  });
});

describe('restartUrl', () => {
  const entry = `${O}/catalog`;
  it('keeps the page the learner was on', () => {
    expect(restartUrl(`${O}/lesson/9`, O, entry)).toBe(`${O}/lesson/9`);
  });
  it.each(['about:blank', 'https://evil.example/', `${O}.evil.example/`, 'not a url', ''])('falls back to the entry URL for %s', (url) => {
    expect(restartUrl(url, O, entry)).toBe(entry);
  });
});

describe('blocked-navigation notice', () => {
  it('a blocked top-frame navigation shows "Indisponível no app"', () => {
    expect(blockedNotice('block', true)).toBe(BLOCKED_NOTICE);
    expect(BLOCKED_NOTICE).toBe('Indisponível no app');
    expect(blockedNotice('block', true, 'en')).toBe('Not available in the app');
  });
  it.each([
    ['block', false],
    ['load', true],
    ['external', true],
  ] as const)('%s, top frame %s: no notice', (decision, top) => {
    expect(blockedNotice(decision, top)).toBeNull();
  });
});

describe('hardware back', () => {
  it.each([
    [true, 'ready', true],
    [true, 'loading', true],
    [false, 'ready', false],
    [false, 'loading', false],
    [true, 'failed', false],
    [false, 'failed', false],
  ] as const)('canGoBack %s, phase %s -> handled %s', (canGoBack, phase, want) => {
    expect(shouldHandleBack(canGoBack, phase)).toBe(want);
  });
});

describe('noticeDue', () => {
  it('the first notice is due; the next one waits NOTICE_GAP_MS', () => {
    expect(noticeDue(null, 1000)).toBe(true);
    expect(noticeDue(1000, 1000 + NOTICE_GAP_MS - 1)).toBe(false);
    expect(noticeDue(1000, 1000 + NOTICE_GAP_MS)).toBe(true);
  });
});

describe('start URL of a re-created WebView', () => {
  const A = 'https://app.iterahq.dev/lesson/a';
  const B = 'https://app.iterahq.dev/lesson/b';

  it('starts on the entry URL', () => {
    expect(INITIAL_CHROME.startUrl).toBeNull();
  });
  it('a retry and a process death start the new WebView on the URL they carry', () => {
    const card = run([{ type: 'error', description: 'x' }]);
    expect(run([{ type: 'retry', url: A }], card).startUrl).toBe(A);
    expect(run([{ type: 'processGone', url: B }]).startUrl).toBe(B);
  });
  it('the start URL changes only together with the mount key', () => {
    const ready = run([{ type: 'processGone', url: A }, { type: 'loadEnd' }]);
    const ignored = run([{ type: 'retry', url: B }], ready);
    expect(ignored.mountKey).toBe(ready.mountKey);
    expect(ignored.startUrl).toBe(A);
  });
  it('the death that shows the card keeps the mounted WebView on its URL: no new source, so no load under the card', () => {
    const twice = run([{ type: 'processGone', url: A }, { type: 'processGone', url: A }]);
    const dead = run([{ type: 'processGone', url: B }], twice);
    expect(dead.failure).toBe('process');
    expect(dead.mountKey).toBe(twice.mountKey);
    expect(dead.startUrl).toBe(A);
  });
  it('an event with no URL keeps the one before it', () => {
    expect(run([{ type: 'processGone', url: A }, { type: 'processGone' }]).startUrl).toBe(A);
  });
});

describe('load (R-20: the page the DFL session returned)', () => {
  const R = 'https://app.iterahq.dev/auth/dfl/callback#dfl_token=t&next=%2F';

  it('creates the WebView again on that URL, from the ready phase', () => {
    const ready = run([{ type: 'loadEnd' }]);
    const next = run([{ type: 'load', url: R }], ready);
    expect(next.startUrl).toBe(R);
    expect(next.mountKey).toBe(ready.mountKey + 1);
    expect(next.phase).toBe('loading');
  });
  it('works from the failure card too, and clears the failure', () => {
    const card = run([{ type: 'error', description: 'x' }]);
    const next = run([{ type: 'load', url: R }], card);
    expect(next.failure).toBeNull();
    expect(next.startUrl).toBe(R);
  });
});

describe('restartUrl never restarts on the DFL callback (R-20)', () => {
  const E = 'https://app.iterahq.dev/login';
  it.each([
    'https://app.iterahq.dev/auth/dfl/callback',
    'https://app.iterahq.dev/auth/dfl/callback#dfl_token=t&next=%2F',
    'https://app.iterahq.dev/auth/dfl/callback?x=1#dfl_token=t',
    'https://app.iterahq.dev/auth/dfl/callback/#dfl_token=t',
    'https://APP.iterahq.dev/Auth/DFL/Callback#dfl_token=t',
  ])('%s restarts on the home path', (last) => {
    expect(restartUrl(last, O, E)).toBe('https://app.iterahq.dev/');
  });
  it('also when the entry URL is the callback and the last URL is elsewhere', () => {
    expect(restartUrl('https://evil.tld/x', O, 'https://app.iterahq.dev/auth/dfl/callback#dfl_token=t')).toBe('https://app.iterahq.dev/');
  });
  it('leaves every other page alone, including look-alike paths', () => {
    expect(restartUrl('https://app.iterahq.dev/lesson/1?a=1#b', O, E)).toBe('https://app.iterahq.dev/lesson/1?a=1#b');
    expect(restartUrl('https://app.iterahq.dev/auth/dfl/callbackx', O, E)).toBe('https://app.iterahq.dev/auth/dfl/callbackx');
    expect(restartUrl('https://app.iterahq.dev/x?next=/auth/dfl/callback', O, E)).toBe('https://app.iterahq.dev/x?next=/auth/dfl/callback');
  });
});

describe('blockedNotice on Android, where the frame is not reported', () => {
  it('a blocked request with no isTopFrame shows the notice; an explicit sub-frame does not', () => {
    expect(blockedNotice('block', isTopFrameRequest(undefined))).toBe(BLOCKED_NOTICE);
    expect(blockedNotice('block', isTopFrameRequest(false))).toBeNull();
  });
});

describe('createLateGuard: the second line of the Android guard', () => {
  const O = 'https://app.iterahq.dev';
  const GOOD = `${O}/lesson/x`;
  let t = 0;
  const guard = (top: readonly string[] = [], authSession = true) => createLateGuard(O, top, authSession, () => t);
  const handoff = `https://learn.devfellowship.com/auth/federate?return=${encodeURIComponent(`${O}/auth/dfl/callback`)}`;
  const STRIPE = 'https://checkout.stripe.com/x';

  it.each([O, `${O}/`, `${O}/lesson/x?y=1`, `${O}/#section`, `${O}/lesson/x#frag`, 'about:blank'])('lets %s through', (url) => {
    expect(guard().judge(url, GOOD)).toEqual({ kind: 'none' });
  });

  it.each(['https://checkout.stripe.com/c/pay/x', 'https://billing.stripe.com/p/session/y', 'https://checkout.stripe.com./c'])('a blocked origin recovers with the notice: %s', (url) => {
    expect(guard().judge(url, GOOD)).toEqual({ kind: 'recover', notice: BLOCKED_NOTICE });
  });

  it('an external origin recovers with no notice (the tap handler already opened it outside)', () => {
    expect(guard().judge('https://example.com/', GOOD)).toEqual({ kind: 'recover', notice: null });
    expect(guard().judge('mailto:a@b.c', GOOD)).toEqual({ kind: 'recover', notice: null });
  });

  it('a custom scheme and a top-frame data: URL recover with the notice', () => {
    expect(guard().judge('itera://x', GOOD)).toEqual({ kind: 'recover', notice: BLOCKED_NOTICE });
    expect(guard().judge('data:text/html,x', GOOD)).toEqual({ kind: 'recover', notice: BLOCKED_NOTICE });
  });

  it('the DFL handoff in an installed build is stopped (the auth sheet is the only place it opens)', () => {
    expect(guard([], true).judge(handoff, GOOD)).toEqual({ kind: 'recover', notice: null });
  });

  it('the DFL handoff in Expo Go, where its origin is allowed in the WebView, is left alone', () => {
    expect(guard(['https://learn.devfellowship.com'], false).judge(handoff, GOOD)).toEqual({ kind: 'none' });
    expect(guard(['https://learn.devfellowship.com'], false).judge('https://learn.devfellowship.com/anything', GOOD)).toEqual({ kind: 'none' });
  });

  it('the fourth recovery onto the same page within a minute is the refusal', () => {
    t = 0;
    const g = guard();
    for (let i = 0; i < MAX_LATE_RECOVERIES; i += 1) expect(g.judge(STRIPE, GOOD).kind).toBe('recover');
    expect(g.judge(STRIPE, GOOD).kind).toBe('stop');
  });

  it('an app page that redirects out after it loaded still trips it: pages finishing in between reset nothing', () => {
    t = 0;
    const g = guard();
    const kinds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      kinds.push(g.judge(STRIPE, GOOD).kind); // the page loads, finishes (allowed), redirects out again, 5 s later
      expect(g.judge(GOOD, GOOD).kind).toBe('none');
      t += 5000;
    }
    expect(kinds).toEqual(['recover', 'recover', 'recover', 'stop', 'stop']);
  });

  it('a quiet period lets the count start again, and another last good page counts on its own', () => {
    t = 0;
    const g = guard();
    for (let i = 0; i < 4; i += 1) g.judge(STRIPE, GOOD);
    expect(g.judge(STRIPE, `${O}/catalog`).kind).toBe('recover');
    t += LATE_WINDOW_MS;
    expect(g.judge(STRIPE, GOOD).kind).toBe('recover');
  });

  it('the relaunch target is never judged a forbidden navigation', () => {
    const entry = `${O}/lesson/x`;
    for (const last of ['https://checkout.stripe.com/x', `${O}/auth/dfl/callback#dfl_token=t`, entry]) {
      expect(guard().judge(restartUrl(last, O, entry), GOOD)).toEqual({ kind: 'none' });
    }
  });

  it('the refusal puts the failure card up at once, through the reducer, from the veil and from a committed page', () => {
    expect(classifyLoadError({ description: LATE_GUARD_ERROR })).toBe('load');
    for (const start of [INITIAL_CHROME, chromeReducer(INITIAL_CHROME, { type: 'loadEnd' })]) {
      const state = chromeReducer(start, { type: 'error', description: LATE_GUARD_ERROR });
      expect(isCardVisible(state)).toBe(true);
      expect(isVeilVisible(state)).toBe(false);
      expect(state.failure).toBe('load');
      // The card's Retry creates the WebView again on a page that was let through.
      expect(chromeReducer(state, { type: 'retry', url: `${O}/` }).startUrl).toBe(`${O}/`);
    }
  });
});

describe('classifyLoadStart: Android reports pushState as a load start', () => {
  const ready = chromeReducer(INITIAL_CHROME, { type: 'loadEnd' });

  it('Android: a start with loading false on a ready page is a history update', () => {
    expect(classifyLoadStart('android', false, 'ready')).toBe('history');
  });
  it.each([
    ['android', true, 'ready'],
    ['android', false, 'loading'],
    ['android', false, 'failed'],
    ['ios', false, 'ready'],
    ['ios', true, 'ready'],
  ] as const)('%s loading=%s phase=%s is a load', (os, loading, phase) => {
    expect(classifyLoadStart(os, loading, phase)).toBe('load');
  });

  it('the Android pushState sequence: a ready page stays ready, with no timer id change and no failure card', () => {
    // first load: start (loading true), finish
    let state = chromeReducer(INITIAL_CHROME, { type: 'loadStart' });
    state = chromeReducer(state, { type: 'loadEnd' });
    expect(state.phase).toBe('ready');
    const loadId = state.loadId;
    // three route changes of the SPA: doUpdateVisitedHistory -> topLoadingStart with loading false; no onPageFinished follows
    for (let i = 0; i < 3; i += 1) {
      if (classifyLoadStart('android', false, state.phase) === 'load') state = chromeReducer(state, { type: 'loadStart' });
    }
    expect(state).toEqual(chromeReducer(ready, { type: 'loadEnd' }));
    expect(state.loadId).toBe(loadId);
    expect(isVeilVisible(state)).toBe(false);
    // the 15 s timer is armed only while loading, so there is none to fire; a stale one would not either
    expect(chromeReducer(state, { type: 'timeout', loadId })).toBe(state);
  });

  it('without the rule the same sequence ends in the failure card (what Android did)', () => {
    let state = chromeReducer(chromeReducer(INITIAL_CHROME, { type: 'loadStart' }), { type: 'loadEnd' });
    state = chromeReducer(state, { type: 'loadStart' });
    expect(isVeilVisible(state)).toBe(true);
    expect(isCardVisible(chromeReducer(state, { type: 'timeout', loadId: state.loadId }))).toBe(true);
  });

  it('a real navigation from a ready page (loading true) still starts a load', () => {
    const state = chromeReducer(ready, { type: 'loadStart' });
    expect(state.phase).toBe('loading');
  });
});

describe('classifyLoadError: the code first, the text as the fallback', () => {
  const ios = (code: number, description = 'localised text that matches nothing', domain = 'NSURLErrorDomain') => classifyLoadError({ os: 'ios', code, domain, description });
  const android = (code: number, description = 'net::ERR_SOMETHING_ELSE') => classifyLoadError({ os: 'android', code, description });

  it.each([
    [-1009, 'not connected'],
    [-1020, 'data not allowed'],
    [-1018, 'international roaming off'],
    [-1005, 'connection lost'],
    [-1003, 'cannot find host'],
  ])('iOS %i (%s) is offline whatever the language of the text', (code) => {
    expect(ios(code, 'Sem conexão com a Internet.')).toBe('offline');
    expect(ios(code, '')).toBe('offline');
  });

  it.each([-1001, -1004, -1200, -1100, -999, 0])('iOS %i is not listed: a text that matches nothing is a load failure', (code) => {
    expect(ios(code)).toBe('load');
  });

  it('iOS: a code of another domain is not an NSURLError code', () => {
    expect(ios(-1009, 'x', 'WebKitErrorDomain')).toBe('load');
    expect(classifyLoadError({ os: 'ios', code: -1009, description: 'x' })).toBe('load');
  });

  it('Android -2 (ERROR_HOST_LOOKUP, a Wi-Fi without internet) is offline', () => {
    expect(android(-2, 'net::ERR_NAME_NOT_RESOLVED')).toBe('offline');
    expect(android(-2, '')).toBe('offline');
  });

  it.each([-1, -6, -8, -11, -14])('Android %i is not decided by the code alone: the other text keeps it a load failure', (code) => {
    expect(android(code)).toBe('load');
  });

  it('Android -6 and -8 with an offline net:: text are offline (the text is the fallback)', () => {
    expect(android(-6, 'net::ERR_INTERNET_DISCONNECTED')).toBe('offline');
    expect(android(-8, 'net::ERR_NETWORK_CHANGED')).toBe('offline');
    expect(android(-6, 'net::ERR_ADDRESS_UNREACHABLE')).toBe('offline');
  });

  it('an iOS code is not read on Android and the reverse', () => {
    expect(classifyLoadError({ os: 'android', code: -1009, description: 'x' })).toBe('load');
    expect(classifyLoadError({ os: 'ios', domain: 'NSURLErrorDomain', code: -2, description: 'x' })).toBe('load');
  });

  it('an unknown code with an English text falls back to the text', () => {
    expect(ios(-7777, 'The Internet connection appears to be offline.')).toBe('offline');
    expect(ios(-7777, 'You are not connected to the internet')).toBe('offline');
    expect(ios(-7777, 'The network connection was lost.')).toBe('offline');
    expect(android(-7777, 'net::ERR_NAME_NOT_RESOLVED')).toBe('offline');
  });

  it('no code, no OS, odd values: a plain load failure, never a throw', () => {
    expect(classifyLoadError({ description: 'x' })).toBe('load');
    expect(classifyLoadError({ description: 'x', code: -1009 })).toBe('load');
    expect(classifyLoadError({ description: 'x', code: Number.NaN, os: 'ios', domain: 'NSURLErrorDomain' })).toBe('load');
    expect(classifyLoadError({ description: undefined as unknown as string, code: 'x' as unknown as number, os: 'web' })).toBe('load');
  });

  it('the reducer passes code, domain and os to the classifier', () => {
    const s = run([{ type: 'error', description: 'Sem conexão', code: -1009, domain: 'NSURLErrorDomain', os: 'ios' }]);
    expect(s.failure).toBe('offline');
    expect(cardCopy(s.failure).title).toBe('Sem conexão');
  });
});
