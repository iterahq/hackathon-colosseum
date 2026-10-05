import { describe, expect, it } from 'vitest';
import { BLOCKED_ORIGINS, DEFAULT_WEB_ORIGIN, navigationDecision, originOf, parseWebOrigin } from './origin';
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
    expect(navigationDecision(url, O)).toBe(want);
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
    expect(navigationDecision(url, O)).toBe('block');
  });
  it('blocks both Stripe origins by default and with an explicit list', () => {
    expect(BLOCKED_ORIGINS).toEqual(['https://checkout.stripe.com', 'https://billing.stripe.com']);
    expect(navigationDecision('https://checkout.stripe.com/x', O, true, [], ['https://checkout.stripe.com'])).toBe('block');
  });
  it('an empty list blocks nothing: the same URL goes to the system browser', () => {
    expect(navigationDecision('https://checkout.stripe.com/x', O, true, [], [])).toBe('external');
  });
  it.each([
    ['another port', 'https://checkout.stripe.com:8443/'],
    ['a look-alike host', 'https://checkout.stripe.com.evil.example/'],
    ['a sibling host', 'https://js.stripe.com/'],
    ['plain http', 'http://checkout.stripe.com/'],
  ])('does not treat %s as the blocked origin', (_what, url) => {
    expect(navigationDecision(url, O)).toBe('external');
  });
  it.each([
    ['a user-info spoof (Stripe as the host)', 'https://evil.example@checkout.stripe.com/'],
    ['a user-info spoof (Stripe as the user)', 'https://checkout.stripe.com@evil.example/'],
  ])('blocks %s', (_what, url) => {
    expect(navigationDecision(url, O)).toBe('block');
  });
  it('does not widen sub-frames: a blocked origin is a plain cross-origin frame', () => {
    expect(navigationDecision('https://checkout.stripe.com/x', O, false)).toBe('block');
  });
});

describe('navigationDecision, DFL sign-in handoff and the app origin only', () => {
  it.each([
    'https://learn.devfellowship.com/auth/federate?redirect=x',
    'https://learn.devfellowship.com/anything',
  ])('%s goes to the system browser, never loads in the WebView', (url) => {
    expect(navigationDecision(url, O)).toBe('external');
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
    expect(navigationDecision(url, O)).toBe(want);
  });
  it.each(['https://APP.ITERAHQ.DEV/login', 'HTTPS://app.iterahq.dev:443/login'])('%s is the app origin', (url) => {
    expect(navigationDecision(url, O)).toBe('load');
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
    expect(navigationDecision(url, O, false)).toBe(want);
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
    expect(navigationDecision(url, O, false)).toBe('block');
  });

  it('an explicit allow list loads an exact origin, and only that origin', () => {
    const allow = ['https://player.example'];
    expect(navigationDecision('https://player.example/v/1', O, false, allow)).toBe('load');
    expect(navigationDecision('https://player.example:444/v/1', O, false, allow)).toBe('block');
    expect(navigationDecision('http://player.example/v/1', O, false, allow)).toBe('block');
  });
});
