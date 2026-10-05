import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { CONSOLE_FORWARDER_SOURCE } from './consoleForwarder.injected';
import {
  MAX_MESSAGES_PER_SECOND,
  MAX_MESSAGE_CHARS,
  MAX_RAW_CHARS_PER_SECOND,
  MAX_RAW_MESSAGES_PER_SECOND,
  MAX_TEXT_CHARS,
  admitMessage,
  admitRaw,
  buildConsoleForwarder,
  messageSize,
  parseConsoleMessage,
  redactSecrets,
  type RawBucket,
} from './consoleMessage';

const O = 'https://app.iterahq.dev';
const post = (data: unknown, url: unknown = `${O}/lesson/1`) => parseConsoleMessage({ data, url }, O);
const wire = (level: string, text: string) => JSON.stringify({ type: 'console', level, text });

describe('parseConsoleMessage', () => {
  it('accepts the forwarder shape from a frame on the app origin', () => {
    expect(post(wire('error', 'boom'))).toEqual({ type: 'console', level: 'error', text: 'boom' });
    expect(post(wire('uncaught', 'x'))?.level).toBe('uncaught');
    expect(post(wire('rejection', 'x'))?.level).toBe('rejection');
  });
  it.each([
    ['another origin', 'https://evil.example/'],
    ['a look-alike host', 'https://app.iterahq.dev.evil.example/'],
    ['another port', 'https://app.iterahq.dev:8443/'],
    ['plain http', 'http://app.iterahq.dev/'],
    ['an opaque frame', 'about:blank'],
    ['no URL', null],
  ])('drops a message from %s', (_what, url) => {
    expect(post(wire('error', 'boom'), url)).toBeNull();
  });
  it.each([
    ['not JSON', 'hello'],
    ['not a string', { type: 'console', level: 'error', text: 'x' }],
    ['null', 'null'],
    ['an array', '[]'],
    ['another type', JSON.stringify({ type: 'bridge', level: 'error', text: 'x' })],
    ['an unknown level', wire('warn', 'x')],
    ['a missing text', JSON.stringify({ type: 'console', level: 'error' })],
    ['a non-string text', JSON.stringify({ type: 'console', level: 'error', text: 7 })],
  ])('drops %s', (_what, data) => {
    expect(post(data)).toBeNull();
  });
  it('drops an oversized message', () => {
    expect(post(wire('error', 'a'.repeat(MAX_MESSAGE_CHARS)))).toBeNull();
  });
  it('cuts the text', () => {
    expect(post(wire('error', 'a'.repeat(MAX_TEXT_CHARS + 100)))?.text).toHaveLength(MAX_TEXT_CHARS);
  });
  it('redacts a token that reached it unredacted', () => {
    expect(post(wire('error', 'GET /cb#dfl_token=abc123&next=/'))?.text).toBe('GET /cb#dfl_token=[redacted]&next=/');
  });
  it('refuses an origin that is not http(s)', () => {
    expect(parseConsoleMessage({ data: wire('error', 'x'), url: 'about:blank' }, 'about:blank')).toBeNull();
  });
});

describe('redactSecrets', () => {
  it.each([
    ['access_token=abc.def&x=1', 'access_token=[redacted]&x=1'],
    ['?refresh_token=r1', '?refresh_token=[redacted]'],
    ['#dfl_token=z9&next=/', '#dfl_token=[redacted]&next=/'],
    ['{"access_token":"abc123","x":1}', '{"access_token":"[redacted]","x":1}'],
    ['ACCESS_TOKEN = abc', 'ACCESS_TOKEN = [redacted]'],
    ['Bearer eyJhbGciOi.eyJzdWIiOiIx.c2ln', 'Bearer [redacted]'],
    ['Authorization: Bearer abcDEF1234567890xyz', 'Authorization: Bearer [redacted]'],
    ['bearer short', 'bearer short'],
    ['apikey=sb123&x=1', 'apikey=[redacted]&x=1'],
    ['{"api_key":"k-9"}', '{"api_key":"[redacted]"}'],
    ['key sb_publishable_AbC123-x ok', 'key [redacted] ok'],
    ['save failed for ana.silva+x@example.com', 'save failed for [email]'],
    ['nothing to hide', 'nothing to hide'],
  ])('%s', (input, want) => {
    expect(redactSecrets(input)).toBe(want);
  });
});

interface Harness {
  posted: string[];
  listeners: Record<string, (event: unknown) => void>;
  calls: unknown[][];
  error: (...args: unknown[]) => void;
  clock: { now: number };
}

/** Runs the built script in a bare context: a stand-in for the page, with `globalThis` as the global object. */
function load(origin: string, forwarderOrigin = O, withBridge = true): Harness {
  const posted: string[] = [];
  const listeners: Harness['listeners'] = {};
  const calls: unknown[][] = [];
  const clock = { now: 1_000_000 };
  const sandbox: Record<string, unknown> = {
    location: { origin },
    console: { error: (...args: unknown[]) => calls.push(args) },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
  };
  if (withBridge) sandbox.ReactNativeWebView = { postMessage: (message: string) => posted.push(message) };
  const context = vm.createContext(sandbox);
  context.Date = { now: () => clock.now };
  vm.runInContext(buildConsoleForwarder(forwarderOrigin), context);
  return { posted, listeners, calls, error: (...args) => (context.console as { error: (...a: unknown[]) => void }).error(...args), clock };
}

describe('console forwarder script (ADR-5 constraints)', () => {
  it('is a plain string source with the origin placeholder, and nothing else exported', () => {
    expect(typeof CONSOLE_FORWARDER_SOURCE).toBe('string');
    expect(CONSOLE_FORWARDER_SOURCE).toContain('__APP_ORIGIN__');
    expect(CONSOLE_FORWARDER_SOURCE.trimEnd().endsWith('true;')).toBe(true);
  });
  it('builds a script with the origin as a JSON literal and refuses a non-http(s) origin', () => {
    expect(buildConsoleForwarder(`${O}/path?x=1`)).toContain(`!== "${O}"`);
    expect(buildConsoleForwarder(O)).not.toContain('__APP_ORIGIN__');
    expect(() => buildConsoleForwarder('about:blank')).toThrow(/http/);
  });

  it('1: attaches only on the app origin', () => {
    const own = load(O);
    own.error('boom');
    expect(own.posted).toHaveLength(1);
    expect(Object.keys(own.listeners).sort()).toEqual(['error', 'unhandledrejection']);
    for (const other of ['null', 'https://evil.example', 'https://app.iterahq.dev.evil.example', 'http://app.iterahq.dev']) {
      const h = load(other);
      h.error('boom');
      expect(h.posted).toEqual([]);
      expect(h.listeners).toEqual({});
    }
  });
  it('still calls the original console.error with the original arguments', () => {
    const h = load(O);
    h.error('a', 2);
    expect(h.calls).toEqual([['a', 2]]);
  });
  it('2: redacts tokens before posting', () => {
    const h = load(O);
    h.error('callback failed', 'https://app.iterahq.dev/auth/dfl/callback#dfl_token=SECRET1&next=/');
    h.error({ access_token: 'SECRET2', refresh_token: 'SECRET3' });
    h.error('Bearer eyJhbGciOi.eyJzdWIiOiIx.c2ln');
    h.error('Authorization: Bearer opaqueTOKEN1234567890', 'apikey=SECRET4', 'sb_publishable_SECRET5', 'ana@example.com');
    const all = h.posted.join('\n');
    expect(all).not.toMatch(/SECRET|eyJ|opaqueTOKEN|ana@/);
    expect(all).toContain('dfl_token=[redacted]');
    expect(all).toContain('access_token');
  });
  it('3: posts the three event kinds in the console shape', () => {
    const h = load(O);
    h.error(new (vm.runInNewContext('Error') as ErrorConstructor)('bad'));
    h.listeners.error({ message: 'ReferenceError: x is not defined' });
    h.listeners.unhandledrejection({ reason: 'nope' });
    expect(h.posted.map((m) => JSON.parse(m))).toEqual([
      { type: 'console', level: 'error', text: 'Error: bad' },
      { type: 'console', level: 'uncaught', text: 'ReferenceError: x is not defined' },
      { type: 'console', level: 'rejection', text: 'nope' },
    ]);
  });
  it('3: every posted message passes the native parser', () => {
    const h = load(O);
    h.error('boom');
    h.listeners.error({});
    expect(h.posted.map((data) => parseConsoleMessage({ data, url: `${O}/` }, O)?.type)).toEqual(['console', 'console']);
  });
  it('size: cuts the text to 500 characters', () => {
    const h = load(O);
    h.error('x'.repeat(5000));
    expect(JSON.parse(h.posted[0]).text).toHaveLength(MAX_TEXT_CHARS);
    expect(h.posted[0].length).toBeLessThan(MAX_MESSAGE_CHARS);
  });
  it('size: a value that cannot be serialized does not throw', () => {
    const h = load(O);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => h.error(cyclic)).not.toThrow();
    expect(JSON.parse(h.posted[0]).text).toBe('[unserializable]');
  });
  it('rate: at most 5 messages in one second, and the next second starts afresh', () => {
    const h = load(O);
    for (let i = 0; i < 20; i++) h.error(`e${i}`);
    expect(h.posted).toHaveLength(5);
    h.clock.now += 1000;
    h.error('later');
    expect(h.posted).toHaveLength(6);
  });
  it('rate: at most 50 messages per page load', () => {
    const h = load(O);
    for (let i = 0; i < 100; i++) {
      h.clock.now += 1000;
      h.error(`e${i}`);
    }
    expect(h.posted).toHaveLength(50);
  });
  it('a missing bridge object is not an error', () => {
    const h = load(O, O, false);
    expect(() => h.error('boom')).not.toThrow();
    expect(h.calls).toEqual([['boom']]);
  });
});

describe('admitMessage (native-side limit)', () => {
  it(`admits ${MAX_MESSAGES_PER_SECOND} messages in a second and drops the rest`, () => {
    let w = { start: 0, count: 0 };
    let admitted = 0;
    for (let i = 0; i < 50; i++) {
      const r = admitMessage(w, 5000 + i);
      w = r.bucket;
      if (r.admitted) admitted += 1;
    }
    expect(admitted).toBe(MAX_MESSAGES_PER_SECOND);
  });
  it('admits again once a second has passed', () => {
    let w = { start: 0, count: 0 };
    for (let i = 0; i < 20; i++) w = admitMessage(w, 5000).bucket;
    expect(admitMessage(w, 5000).admitted).toBe(false);
    expect(admitMessage(w, 6000).admitted).toBe(true);
  });
});

describe('messageSize and admitRaw (the raw limit in front of the parsers, R-12)', () => {
  const PAGE = `${O}/lesson/1`;

  it('messageSize is the length of a string from a frame on the app origin, and null for anything else, with no parse', () => {
    const parse = vi.spyOn(JSON, 'parse');
    expect(messageSize({ data: 'x'.repeat(300), url: PAGE }, O)).toBe(300);
    expect(messageSize({ data: '{"a":1}', url: O }, O)).toBe(7);
    for (const url of ['about:srcdoc', 'null', 'https://evil.example/', 'blob:https://app.iterahq.dev/1', null, 7]) {
      expect(messageSize({ data: '{"a":1}', url }, O)).toBeNull();
    }
    expect(messageSize({ data: { a: 1 }, url: PAGE }, O)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('admitRaw admits a count and a length per second, refuses beyond either, and opens again a second later', () => {
    const bucket: RawBucket = { start: 0, count: 0, chars: 0 };
    let admitted = 0;
    for (let i = 0; i < 500; i++) if (admitRaw(bucket, 5000 + i, 10)) admitted += 1;
    expect(admitted).toBe(MAX_RAW_MESSAGES_PER_SECOND);
    expect(admitRaw(bucket, 6000, 10)).toBe(true);

    const big: RawBucket = { start: 0, count: 0, chars: 0 };
    let chars = 0;
    for (let i = 0; i < 30; i++) if (admitRaw(big, 9000, 64 * 1024)) chars += 64 * 1024;
    expect(chars).toBe(MAX_RAW_CHARS_PER_SECOND);
    expect(admitRaw(big, 9000, 1)).toBe(false);
  });

  it('admitRaw changes the bucket in place: the same object, no new one per message', () => {
    const bucket: RawBucket = { start: 0, count: 0, chars: 0 };
    admitRaw(bucket, 5000, 12);
    expect(bucket).toEqual({ start: 5000, count: 1, chars: 12 });
  });

  /** The order of `onMessage` in app/[...path].tsx (pinned as text by scripts/mobile/shell-route.test.ts). */
  function shell() {
    const raw: RawBucket = { start: 0, count: 0, chars: 0 };
    let page = { start: 0, count: 0 };
    const handled: string[] = [];
    return {
      handled,
      receive(event: { data: unknown; url: unknown }, now: number) {
        const size = messageSize(event, O);
        if (size === null || !admitRaw(raw, now, size)) return;
        const message = parseConsoleMessage(event, O);
        if (message === null) return;
        const admission = admitMessage(page, now);
        page = admission.bucket;
        if (admission.admitted) handled.push(message.text);
      },
    };
  }

  it('starvation is impossible where the frame is known: a sandboxed frame posting in a loop costs the page nothing', () => {
    const s = shell();
    const parse = vi.spyOn(JSON, 'parse');
    for (let i = 0; i < 100_000; i++) s.receive({ data: wire('error', 'flood'), url: i % 2 ? 'about:srcdoc' : 'null' }, 5000);
    expect(parse).not.toHaveBeenCalled();
    s.receive({ data: wire('error', 'the page'), url: PAGE }, 5000);
    expect(s.handled).toEqual(['the page']);
    parse.mockRestore();
  });

  it('garbage from the app origin does not use up the page budget', () => {
    const s = shell();
    for (let i = 0; i < MAX_RAW_MESSAGES_PER_SECOND - 1; i++) s.receive({ data: '{"not":"ours"}', url: PAGE }, 5000);
    s.receive({ data: wire('error', 'the page'), url: PAGE }, 5000);
    expect(s.handled).toEqual(['the page']);
  });

  it('the parse flood is bounded where every frame looks like the page (Android legacy): 100 000 messages, at most the raw limit is parsed', () => {
    const s = shell();
    const parse = vi.spyOn(JSON, 'parse');
    const big = wire('error', 'x'.repeat(3000));
    for (let i = 0; i < 100_000; i++) s.receive({ data: big, url: PAGE }, 5000 + (i % 900));
    expect(parse.mock.calls.length).toBeLessThanOrEqual(MAX_RAW_MESSAGES_PER_SECOND);
    expect(parse.mock.calls.reduce((n, [text]) => n + String(text).length, 0)).toBeLessThanOrEqual(MAX_RAW_CHARS_PER_SECOND);
    expect(s.handled.length).toBe(MAX_MESSAGES_PER_SECOND);
    parse.mockRestore();
  });
});
