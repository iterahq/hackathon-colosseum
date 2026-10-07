import { describe, expect, it } from 'vitest';
import { BLOCKED_ORIGINS, DEFAULT_WEB_ORIGIN, dflCallbackUrl, isDflHandoff, isTopFrameRequest, navigationDecision, originOf, parseWebOrigin } from './origin';
import appJson from '../app.json';

const O = 'https://app.iterahq.dev';

describe('parseWebOrigin', () => {
  it('reads the one config value of app.json', () => {
    expect(parseWebOrigin(appJson.expo.extra.webOrigin)).toBe(O);
  });
  it('falls back to the production origin', () => {
    expect(DEFAULT_WEB_ORIGIN).toBe(O);
    expect(parseWebOrigin(undefined)).toBe(O);
  });
  it.each(['itera://localhost', 'file:///app/index.html', 'http://app.iterahq.dev'])('refuses %s', (v) => {
    expect(() => parseWebOrigin(v)).toThrow(/https/);
  });
  it.each(['not a url', 'app.iterahq.dev', 'https://', '://app.iterahq.dev'])('refuses %j as not a URL, and the message names it', (v) => {
    expect(() => parseWebOrigin(v)).toThrow(`expo.extra.webOrigin is not a URL: ${v}`);
  });
  it('refuses a value with a path', () => {
    expect(() => parseWebOrigin(`${O}/app`)).toThrow(/no path/);
  });
});

describe('originOf', () => {
  it.each([
    ['https://app.iterahq.dev/login?x=1', O],
    ['HTTPS://APP.ITERAHQ.DEV:443/', O],
    ['https://app.iterahq.dev:8443/', 'https://app.iterahq.dev:8443'],
    ['http://app.iterahq.dev:80/', 'http://app.iterahq.dev'],
  ])('%s -> %s', (url, want) => {
    expect(originOf(url)).toBe(want);
  });
  it.each(['blob:https://app.iterahq.dev/1', 'data:text/plain,hi', 'about:blank', 'https://app.iterahq.dev@evil.example/', 'not a url'])(
    'is opaque for %s',
    (url) => {
      expect(originOf(url)).toBeNull();
    },
  );
});

describe('navigationDecision, top frame', () => {
  it.each([
    [`${O}/lesson/1`, 'load'],
    ['about:blank', 'load'],
    ['https://www.youtube.com/watch?v=x', 'external'],
    ['http://app.iterahq.dev/', 'external'],
    ['mailto:a@b.c', 'external'],
    ['tel:+5511999999999', 'external'],
    [`blob:${O}/8c1d`, 'block'],
    ['data:text/plain,hi', 'block'],
    ['javascript:alert(1)', 'block'],
    ['itera://login', 'block'],
    ['intent://scan/#Intent;scheme=zxing;end', 'block'],
    ['itms-services://x', 'block'],
    ['not a url', 'block'],
  ])('%s -> %s', (url, want) => {
    expect(navigationDecision(url, { origin: O })).toBe(want);
  });
});

describe('navigationDecision, blocked origins (ADR-5, Q-3)', () => {
  it.each([
    'https://checkout.stripe.com/c/pay/cs_test_123',
    'https://billing.stripe.com/p/session/abc',
    'https://CHECKOUT.STRIPE.COM/c/pay/x',
    'HTTPS://billing.stripe.com/',
    'https://checkout.stripe.com./c/pay/x',
    'https://checkout.stripe.com:443/c/pay/x',
  ])('blocks %s: not loaded, not handed to the system browser', (url) => {
    expect(navigationDecision(url, { origin: O })).toBe('block');
  });
  it('blocks both Stripe origins by default and with an explicit list', () => {
    expect(BLOCKED_ORIGINS).toEqual(['https://checkout.stripe.com', 'https://billing.stripe.com']);
    expect(navigationDecision('https://checkout.stripe.com/x', { origin: O, frameOrigins: [], blockedOrigins: ['https://checkout.stripe.com'] })).toBe('block');
  });
  it('an empty list blocks nothing: the same URL goes to the system browser', () => {
    expect(navigationDecision('https://checkout.stripe.com/x', { origin: O, frameOrigins: [], blockedOrigins: [] })).toBe('external');
  });
  it.each([
    ['another port', 'https://checkout.stripe.com:8443/'],
    ['a look-alike host', 'https://checkout.stripe.com.evil.example/'],
    ['a sibling host', 'https://js.stripe.com/'],
    ['plain http', 'http://checkout.stripe.com/'],
  ])('does not treat %s as the blocked origin', (_what, url) => {
    expect(navigationDecision(url, { origin: O })).toBe('external');
  });
  it.each([
    ['a user-info spoof (Stripe as the host)', 'https://evil.example@checkout.stripe.com/'],
    ['a user-info spoof (Stripe as the user)', 'https://checkout.stripe.com@evil.example/'],
  ])('blocks %s', (_what, url) => {
    expect(navigationDecision(url, { origin: O })).toBe('block');
  });
  it('the blocked list wins over the app origin', () => {
    expect(navigationDecision('https://checkout.stripe.com/x', { origin: 'https://checkout.stripe.com', frameOrigins: [], blockedOrigins: BLOCKED_ORIGINS })).toBe('block');
  });
  it('does not widen sub-frames: a blocked origin is a plain cross-origin frame', () => {
    expect(navigationDecision('https://checkout.stripe.com/x', { origin: O, isTopFrame: false })).toBe('block');
  });
});

describe('navigationDecision, DFL sign-in handoff and the app origin only', () => {
  it.each([
    'https://learn.devfellowship.com/auth/federate?redirect=x',
    'https://learn.devfellowship.com/anything',
  ])('%s goes to the system browser, never loads in the WebView', (url) => {
    expect(navigationDecision(url, { origin: O })).toBe('external');
  });
});

describe('navigationDecision, bypass strings never load in the top frame', () => {
  it.each([
    ['https://app.iterahq.dev.evil.com/', 'external'],
    ['https://app.iterahq.dev@evil.com/', 'block'],
    ['https://evil.com@app.iterahq.dev/', 'block'],
    ['https://app.iterahq.dev:8443/', 'external'],
    ['https://app.iterahq.dev./', 'external'],
    ['javascript:alert(1)', 'block'],
    ['JAVASCRIPT:alert(1)', 'block'],
    ['data:text/html,<script>1</script>', 'block'],
    ['file:///etc/passwd', 'block'],
    ['intent://scan/#Intent;scheme=zxing;end', 'block'],
  ])('%s -> %s', (url, want) => {
    expect(navigationDecision(url, { origin: O })).toBe(want);
  });
  it.each(['https://APP.ITERAHQ.DEV/login', 'HTTPS://app.iterahq.dev:443/login'])('%s is the app origin', (url) => {
    expect(navigationDecision(url, { origin: O })).toBe('load');
  });
});

describe('navigationDecision, sub-frame', () => {
  it.each([
    [`${O}/render-view`, 'load'],
    ['about:srcdoc', 'load'],
    [`blob:${O}/1`, 'load'],
    ['data:text/html,hi', 'load'],
    ['http://app.iterahq.dev/', 'block'],
    ['file:///var/mobile/evil.html', 'block'],
    ['javascript:alert(1)', 'block'],
    ['wss://app.iterahq.dev/', 'block'],
  ])('%s -> %s', (url, want) => {
    expect(navigationDecision(url, { origin: O, isTopFrame: false })).toBe(want);
  });

  // The media grant of the WebView compares the host only, so a sub-frame of the app host on
  // another port or scheme must not load.
  it.each([
    ['another port of the app host', 'https://app.iterahq.dev:8443/evil'],
    ['the app host on port 80 over https', 'https://app.iterahq.dev:80/'],
    ['an https frame of another site', 'https://www.youtube.com/embed/x'],
    ['a look-alike host', 'https://app.iterahq.dev.evil.example/'],
    ['a user-info spoof', 'https://app.iterahq.dev@evil.example/'],
  ])('%s is blocked', (_what, url) => {
    expect(navigationDecision(url, { origin: O, isTopFrame: false })).toBe('block');
  });

  it('an explicit allow list loads an exact origin, and only that origin', () => {
    const allow = ['https://player.example'];
    expect(navigationDecision('https://player.example/v/1', { origin: O, isTopFrame: false, frameOrigins: allow })).toBe('load');
    expect(navigationDecision('https://player.example:444/v/1', { origin: O, isTopFrame: false, frameOrigins: allow })).toBe('block');
    expect(navigationDecision('http://player.example/v/1', { origin: O, isTopFrame: false, frameOrigins: allow })).toBe('block');
  });
});

describe('navigationDecision — development top-frame origins', () => {
  const APP = 'https://app.iterahq.dev';
  const DFL = 'https://learn.devfellowship.com/auth/federate?return=x';

  it('sends the DFL handoff to the system browser when no origin is listed', () => {
    expect(navigationDecision(DFL, { origin: APP })).toBe('external');
  });

  it('loads a listed https origin in the WebView and nothing that only looks like it', () => {
    const dev = ['https://learn.devfellowship.com'];
    expect(navigationDecision(DFL, { origin: APP, topFrameOrigins: dev })).toBe('load');
    expect(navigationDecision('http://learn.devfellowship.com/auth/federate', { origin: APP, topFrameOrigins: dev })).toBe('external');
    expect(navigationDecision('https://learn.devfellowship.com.evil.com/', { origin: APP, topFrameOrigins: dev })).toBe('external');
    expect(navigationDecision('https://learn.devfellowship.com@evil.com/', { origin: APP, topFrameOrigins: dev })).toBe('block');
  });

  it('keeps a blocked origin blocked even when it is also listed', () => {
    expect(
      navigationDecision('https://checkout.stripe.com/c/pay', { origin: APP, topFrameOrigins: ['https://checkout.stripe.com'] }),
    ).toBe('block');
  });
});

describe('navigationDecision, DFL handoff in the system auth session (R-20)', () => {
  const APP = 'https://app.iterahq.dev';
  const CALLBACK = 'https://app.iterahq.dev/auth/dfl/callback';
  const handoff = (ret: string, extra = '') => `https://learn.devfellowship.com/auth/federate?return=${encodeURIComponent(ret)}${extra}`;
  const decide = (url: string, useAuthSession = true, blocked?: readonly string[]) =>
    navigationDecision(url, { origin: APP, blockedOrigins: blocked, useAuthSession });

  it('answers auth-session for the exact handoff the web builds', () => {
    expect(decide(handoff(CALLBACK, '&next=%2F'))).toBe('auth-session');
    expect(decide(`https://learn.devfellowship.com/auth/federate?next=%2F&return=${encodeURIComponent(CALLBACK)}`)).toBe('auth-session');
    expect(decide(`${handoff(CALLBACK)}#frag`)).toBe('auth-session');
    expect(decide(`HTTPS://LEARN.DEVFELLOWSHIP.COM/auth/federate?return=${encodeURIComponent(CALLBACK)}`)).toBe('auth-session');
    expect(decide(`https://learn.devfellowship.com:443/auth/federate?return=${encodeURIComponent(CALLBACK)}`)).toBe('auth-session');
  });

  it('keeps today\'s answer when the session is off (Expo Go): external, or load when the origin is listed', () => {
    expect(decide(handoff(CALLBACK), false)).toBe('external');
    expect(navigationDecision(handoff(CALLBACK), { origin: APP, topFrameOrigins: ['https://learn.devfellowship.com'], useAuthSession: false })).toBe('load');
  });

  it.each([
    ['another return', handoff('https://app.iterahq.dev/auth/reset')],
    ['a return on another origin', handoff('https://evil.tld/auth/dfl/callback')],
    ['a return with userinfo', handoff('https://app.iterahq.dev@evil.tld/auth/dfl/callback')],
    ['a return with a path suffix', handoff(`${CALLBACK}/x`)],
    ['a return with a query', handoff(`${CALLBACK}?x=1`)],
    ['an http return', handoff('http://app.iterahq.dev/auth/dfl/callback')],
    ['an exp:// return', handoff('exp://192.168.1.2:8081/--/auth/dfl/callback')],
    ['a custom-scheme return', handoff('itera://auth/dfl/callback')],
    ['no return', 'https://learn.devfellowship.com/auth/federate?next=%2F'],
    ['two returns', `${handoff(CALLBACK)}&return=${encodeURIComponent('https://evil.tld/')}`],
    ['two returns, the callback second', `${handoff('https://evil.tld/')}&return=${encodeURIComponent(CALLBACK)}`],
    ['an empty return', 'https://learn.devfellowship.com/auth/federate?return='],
    ['a malformed escape in return', 'https://learn.devfellowship.com/auth/federate?return=%E0%A4%A'],
    ['return only in the fragment', `https://learn.devfellowship.com/auth/federate#return=${encodeURIComponent(CALLBACK)}`],
    ['a parameter that only ends in return', `https://learn.devfellowship.com/auth/federate?xreturn=${encodeURIComponent(CALLBACK)}`],
  ])('does not answer auth-session for %s', (_name, url) => {
    expect(decide(url)).not.toBe('auth-session');
  });

  it.each([
    'https://learn.devfellowship.com/auth/federate/',
    'https://learn.devfellowship.com/auth/Federate',
    'https://learn.devfellowship.com/auth/federate/x',
    'https://learn.devfellowship.com/auth',
    'https://learn.devfellowship.com/anything',
    'https://learn.devfellowship.com//auth/federate',
    'https://learn.devfellowship.com/auth/federated',
  ])('another path on the DFL origin keeps today\'s answer: %s', (path) => {
    const url = `${path}?return=${encodeURIComponent(CALLBACK)}`;
    expect(decide(url)).toBe('external');
  });

  it.each([
    ['a trailing dot', `https://learn.devfellowship.com./auth/federate?return=${encodeURIComponent(CALLBACK)}`, 'external'],
    ['a longer host', `https://learn.devfellowship.com.evil.tld/auth/federate?return=${encodeURIComponent(CALLBACK)}`, 'external'],
    ['a subdomain', `https://x.learn.devfellowship.com/auth/federate?return=${encodeURIComponent(CALLBACK)}`, 'external'],
    ['a port', `https://learn.devfellowship.com:8443/auth/federate?return=${encodeURIComponent(CALLBACK)}`, 'external'],
    ['http', `http://learn.devfellowship.com/auth/federate?return=${encodeURIComponent(CALLBACK)}`, 'external'],
    ['userinfo', `https://learn.devfellowship.com@evil.tld/auth/federate?return=${encodeURIComponent(CALLBACK)}`, 'block'],
    ['userinfo that spells the app', `https://app.iterahq.dev@evil.tld/auth/federate?return=${encodeURIComponent(CALLBACK)}`, 'block'],
    ['leading whitespace', ` ${handoff(CALLBACK)}`, 'external'],
  ])('a look-alike origin is not the handoff: %s', (_name, url, want) => {
    expect(decide(url)).toBe(want);
  });

  it('checks the blocked origins first', () => {
    expect(decide(handoff(CALLBACK), true, ['https://learn.devfellowship.com'])).toBe('block');
  });

  it('never answers auth-session in a sub-frame', () => {
    expect(navigationDecision(handoff(CALLBACK), { origin: APP, isTopFrame: false, useAuthSession: true })).toBe('block');
  });

  it('the app origin and everything else are unchanged with the session on', () => {
    expect(decide('https://app.iterahq.dev/catalog')).toBe('load');
    expect(decide('https://checkout.stripe.com/c/pay')).toBe('block');
    expect(decide('https://example.com/x')).toBe('external');
    expect(decide('itera://x')).toBe('block');
  });

  it('is the handoff only for an https app origin', () => {
    expect(isDflHandoff(handoff(CALLBACK), 'http://app.iterahq.dev')).toBe(false);
    expect(dflCallbackUrl('http://app.iterahq.dev')).toBeNull();
    expect(dflCallbackUrl(APP)).toBe(CALLBACK);
    expect(isDflHandoff(handoff('https://staging.iterahq.dev/auth/dfl/callback'), 'https://staging.iterahq.dev')).toBe(true);
    expect(isDflHandoff(handoff(CALLBACK), 'https://staging.iterahq.dev')).toBe(false);
  });
});

describe('isTopFrameRequest: Android does not report the frame', () => {
  it('reads undefined as the top frame and only an explicit false as a sub-frame', () => {
    expect(isTopFrameRequest(undefined)).toBe(true);
    expect(isTopFrameRequest(true)).toBe(true);
    expect(isTopFrameRequest(false)).toBe(false);
  });

  it('a request without the field is judged as a top frame, the way Android sends it', () => {
    const stripe = 'https://checkout.stripe.com/c/pay/x';
    expect(navigationDecision(stripe, { origin: O, isTopFrame: isTopFrameRequest(undefined) })).toBe('block');
    expect(navigationDecision('data:text/html,x', { origin: O, isTopFrame: isTopFrameRequest(undefined) })).toBe('block');
    expect(navigationDecision('https://example.com/', { origin: O, isTopFrame: isTopFrameRequest(undefined) })).toBe('external');
    expect(navigationDecision('data:text/html,x', { origin: O, isTopFrame: isTopFrameRequest(false) })).toBe('load');
  });
});
