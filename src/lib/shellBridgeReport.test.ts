import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BridgeRefusal, ENVELOPE_TAG, REFUSAL_REASONS, createShellRouter, encode, type BridgeMode } from '@iterahq/shell-bridge';
import { BRIDGE_REFUSAL_EVENT, BridgeSuperseded, CLAIM_NAMES, claimOf, createBridgeReporter } from './shellBridgeReport';

const tracked = vi.hoisted(() => ({ events: [] as Array<[string, Record<string, string>]> }));
vi.mock('@devfellowship/observability', () => ({
  trackEvent: (name: string, attributes: Record<string, string>) => void tracked.events.push([name, attributes]),
}));

const ORIGIN = 'https://app.iterahq.dev';
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln';

function recorder(active = true) {
  const records: Array<[string, Record<string, string>]> = [];
  const reporter = createBridgeReporter({ active: () => active, sink: (name, attributes) => void records.push([name, attributes]) });
  return { reporter, records };
}

describe('createBridgeReporter', () => {
  it.each(REFUSAL_REASONS)('records %s once, with the method and the reason', (reason) => {
    const { reporter, records } = recorder();
    reporter.refusal('auth.session', reason);
    reporter.failure('keepAwake', new BridgeRefusal(reason));
    expect(records).toEqual([
      [BRIDGE_REFUSAL_EVENT, { method: 'auth.session', reason }],
      [BRIDGE_REFUSAL_EVENT, { method: 'keepAwake', reason }],
    ]);
  });

  it('records a second identical refusal once only, and a new method or reason again', () => {
    const { reporter, records } = recorder();
    reporter.refusal('auth.session', 'handler_failed');
    reporter.refusal('auth.session', 'handler_failed');
    reporter.failure('auth.session', new BridgeRefusal('handler_failed', 'anything'));
    expect(records).toHaveLength(1);
    reporter.refusal('auth.session', 'timeout');
    reporter.refusal('keepAwake', 'handler_failed');
    expect(records).toHaveLength(3);
  });

  it('keeps only the allow-listed claim name of the shell claim check', () => {
    for (const claim of CLAIM_NAMES) {
      const { reporter, records } = recorder();
      reporter.failure('auth.session', new BridgeRefusal('handler_failed', `bad payload: ${claim}`));
      expect(records).toEqual([[BRIDGE_REFUSAL_EVENT, { method: 'auth.session', reason: 'handler_failed', claim }]]);
    }
    const { reporter, records } = recorder();
    reporter.failure('auth.session', new BridgeRefusal('handler_failed', 'bad payload: iss'));
    reporter.failure('auth.session', new BridgeRefusal('handler_failed', 'bad payload: aud'));
    expect(records).toHaveLength(2);
  });

  it.each([
    `bad payload: ${TOKEN}`,
    'bad payload: https://kjefmwlopzeaqgqtlbdn.supabase.co/auth/v1',
    'bad payload: iss and more',
    'bad payload: ISS',
    'x bad payload: iss',
    'bad payload: iss\nextra',
    'accessToken',
    `TypeError: ${TOKEN}`,
    '',
  ])('drops the detail %j', (detail) => {
    expect(claimOf(detail)).toBeUndefined();
    const { reporter, records } = recorder();
    reporter.refusal('auth.session', 'handler_failed', detail);
    expect(records).toEqual([[BRIDGE_REFUSAL_EVENT, { method: 'auth.session', reason: 'handler_failed' }]]);
    expect(JSON.stringify(records)).not.toContain(TOKEN);
  });

  it('names an error that is not a refusal `unexpected` and never reads its message', () => {
    const { reporter, records } = recorder();
    reporter.failure('auth.session', new Error(`boom ${TOKEN}`));
    expect(records).toEqual([[BRIDGE_REFUSAL_EVENT, { method: 'auth.session', reason: 'unexpected' }]]);
  });

  it('skips a call the page itself superseded', () => {
    const { reporter, records } = recorder();
    reporter.failure('keepAwake', new BridgeSuperseded());
    expect(records).toEqual([]);
  });

  it('turns a method that is not in the protocol into `other`', () => {
    const { reporter, records } = recorder();
    reporter.refusal(`https://evil.example/${TOKEN}`, 'unknown_method');
    expect(records[0][1].method).toBe('other');
  });

  it('records nothing outside the shell, and never throws', () => {
    const off = recorder(false);
    off.reporter.refusal('auth.session', 'handler_failed');
    off.reporter.failure('keepAwake', new BridgeRefusal('timeout'));
    expect(off.records).toEqual([]);
    const broken = createBridgeReporter({ active: () => true, sink: () => { throw new Error('sink down'); } });
    expect(() => broken.refusal('keepAwake', 'timeout')).not.toThrow();
  });
});

type Listener = (ev: { data: unknown; origin: string; source: unknown }) => void;

/** A window of the shell, answered by the real shell-side router. `delayMs` delays each reply (a slow cold start). */
function routerWindow(handlers: Record<string, (p: unknown) => unknown>, delayMs = 0) {
  const router = createShellRouter({
    origin: ORIGIN,
    shellVersion: '0.3.0',
    handlers: { 'shell.version': () => ({ shellVersion: '0.3.0', protocol: 1 }), ...handlers },
  });
  const listeners = new Set<Listener>();
  const posted: string[] = [];
  const deliver = (data: string) => {
    for (const l of [...listeners]) l({ data, origin: ORIGIN, source: win });
  };
  const win = {
    location: { origin: ORIGIN },
    ReactNativeWebView: {
      postMessage(raw: string) {
        posted.push(raw);
        void router.receive(raw, `${ORIGIN}/lesson/1`).then((out) => {
          if (out.reply) setTimeout(() => deliver(out.reply as string), delayMs);
        });
      },
    },
    addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
  };
  /** Another frame of the app origin handshakes: the shell's session is replaced under the page. */
  const swapSession = () =>
    router.receive(encode({ tag: ENVELOPE_TAG, v: 1, kind: 'hello', id: `wframe${posted.length}abcdef`, payload: { webVersion: 'x', protocols: [1] } }), `${ORIGIN}/`);
  const sent = (kind: string) => posted.map((raw) => JSON.parse(raw) as { kind: string; id: string }).filter((e) => e.kind === kind);
  return { win: win as unknown as Window, router, listeners, posted, deliver, swapSession, sent };
}

const refusingShell = () => routerWindow({ keepAwake: () => { throw new Error(`bad payload: ${TOKEN}`); } }).win;

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('the keep-awake call site', () => {
  beforeEach(() => {
    vi.resetModules();
    tracked.events.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  const mountKeepAwake = async (win: Window, path: string) => {
    const bridge = await import('./shellBridge');
    bridge.startShellBridge(win);
    const { KeepAwakeRouteMount } = await import('./shellKeepAwake');
    await act(async () => {
      render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(KeepAwakeRouteMount)));
    });
    await settle();
  };

  it('records the refusal of the shell once, without the shell text, and does not throw', async () => {
    await mountKeepAwake(refusingShell(), '/lesson/abc');
    expect(tracked.events).toEqual([[BRIDGE_REFUSAL_EVENT, { method: 'keepAwake', reason: 'handler_failed' }]]);
    expect(JSON.stringify(tracked.events)).not.toContain(TOKEN);
  });

  it('records nothing in a browser tab', async () => {
    await mountKeepAwake({ location: { origin: ORIGIN }, addEventListener() {}, removeEventListener() {} } as unknown as Window, '/lesson/abc');
    expect(tracked.events).toEqual([]);
  });
});

describe('the handshake refused by the shell', () => {
  beforeEach(() => {
    vi.resetModules();
    tracked.events.length = 0;
  });

  it('records the reason of a hello the shell refused', async () => {
    const listeners = new Set<Listener>();
    const win = {
      location: { origin: ORIGIN },
      ReactNativeWebView: {
        postMessage(raw: string) {
          const hello = JSON.parse(raw) as { id: string };
          const reply = JSON.stringify({ tag: JSON.parse(raw).tag, v: 1, kind: 'refusal', id: hello.id, reason: 'version_mismatch', detail: `v ${TOKEN}` });
          for (const l of listeners) l({ data: reply, origin: ORIGIN, source: win });
        },
      },
      addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
    };
    const bridge = await import('./shellBridge');
    const client = bridge.startShellBridge(win as unknown as Window);
    const mode: BridgeMode | undefined = await client?.handshake();
    await settle();
    expect(mode?.kind).toBe('web');
    expect(tracked.events).toEqual([[BRIDGE_REFUSAL_EVENT, { method: 'hello', reason: 'version_mismatch' }]]);
  });
});

describe('the page\'s own traffic is not a shell fault', () => {
  beforeEach(() => {
    vi.resetModules();
    tracked.events.length = 0;
  });

  it('a hello resent at 600 ms and answered `replayed_id` records nothing', async () => {
    const shell = routerWindow({}, 700);
    const bridge = await import('./shellBridge');
    const client = bridge.startShellBridge(shell.win);
    const mode = await client?.handshake();
    await settle();
    expect(mode?.kind).toBe('shell');
    expect(shell.sent('hello')).toHaveLength(2);
    expect(tracked.events).toEqual([]);
  });
});

describe('renewing the handshake against the real shell router', () => {
  beforeEach(() => {
    vi.resetModules();
    tracked.events.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('delivers the payload after bad_session, keeps one listener, moves the asks, keeps the surface and sends no resend', async () => {
    const received: unknown[] = [];
    const shell = routerWindow({ 'auth.session': (p) => (received.push(p), {}) });
    const bridge = await import('./shellBridge');
    const surface = await import('./shellSurface');
    const client = bridge.startShellBridge(shell.win);
    if (!client) throw new Error('no client');
    await client.handshake();
    const asked: unknown[] = [];
    client.onAsk('auth.session', (p) => void asked.push(p));
    const notified = vi.fn();
    surface.subscribeShellSurface(notified);
    expect(surface.readShellSurface()).toBe('shell');

    await shell.swapSession();
    await expect(client.call('auth.session', { signedOut: true })).rejects.toMatchObject({ reason: 'bad_session' });
    expect(received).toEqual([]);

    const mode = await client.renew();
    expect(mode.kind).toBe('shell');
    await client.call('auth.session', { signedOut: true });
    expect(received).toEqual([{ signedOut: true }]);

    expect(shell.listeners.size).toBe(1);
    const ask = shell.router.ask('auth.session', { forceRefresh: false });
    expect(ask).not.toBeNull();
    shell.deliver(ask as string);
    await settle();
    expect(asked).toEqual([{ forceRefresh: false }]);

    expect(surface.readShellSurface()).toBe('shell');
    expect(notified).not.toHaveBeenCalled();
    const hellos = shell.sent('hello').length;
    await new Promise((r) => setTimeout(r, 800));
    expect(shell.sent('hello')).toHaveLength(hellos);
    expect(tracked.events).toEqual([]);
  });

  it('a call in flight when the handshake starts over is not a shell refusal, nor is its late reply', async () => {
    const shell = routerWindow({ keepAwake: () => new Promise(() => undefined) });
    const bridge = await import('./shellBridge');
    const client = bridge.startShellBridge(shell.win);
    if (!client) throw new Error('no client');
    await client.handshake();
    const inFlight = client.call('keepAwake', { on: true });
    const failure = inFlight.catch((error: unknown) => {
      bridge.bridgeReport.failure('keepAwake', error);
      return error;
    });
    await settle();
    await client.renew();
    expect(await failure).toMatchObject({ name: 'BridgeSuperseded', reason: 'superseded' });
    const id = shell.sent('call')[0].id;
    shell.deliver(encode({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id, payload: { on: true } }));
    await settle();
    expect(tracked.events).toEqual([]);
  });

  it('keep-awake is asked again after a renewal, because the shell released the lock at the new hello', async () => {
    const awake: boolean[] = [];
    const shell = routerWindow({ keepAwake: (p) => (awake.push((p as { on: boolean }).on), p) });
    const bridge = await import('./shellBridge');
    const client = bridge.startShellBridge(shell.win);
    if (!client) throw new Error('no client');
    const { KeepAwakeRouteMount } = await import('./shellKeepAwake');
    await act(async () => {
      render(createElement(MemoryRouter, { initialEntries: ['/lesson/abc'] }, createElement(KeepAwakeRouteMount)));
    });
    await settle();
    expect(awake).toEqual([true]);
    await shell.swapSession();
    await client.renew();
    await settle();
    expect(awake).toEqual([true, true]);
  });
});
