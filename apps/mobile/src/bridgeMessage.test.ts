import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENVELOPE_TAG, MAX_MESSAGE_BYTES, createBridgeClient, type IncomingMessage } from '@iterahq/shell-bridge';
import { createKeepAwakeClaims, type KeepAwakeClaims, type KeepAwakeEffects } from './keepAwakeHolder';
import { createShellBridge, parseBridgeMessage, type BridgeMessage } from './bridgeMessage';
import { parseConsoleMessage } from './consoleMessage';

const O = 'https://app.iterahq.dev';
const PAGE = `${O}/lesson/1`;
const hello = (id = 'wAAAAAAAA1') => JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'hello', id, payload: { webVersion: 't', protocols: [1] } });
const call = (id: string, method: string, session: string, payload: unknown = {}) =>
  JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'call', id, session, method, payload });
const noEffects: KeepAwakeEffects = { activate: () => undefined, deactivate: () => undefined };
const claimsOf = (effects: KeepAwakeEffects = noEffects): KeepAwakeClaims => createKeepAwakeClaims(effects);
const parse = (data: unknown, url: unknown = PAGE) => parseBridgeMessage({ data, url }, O);
const replyOf = (script: string | null): string => JSON.parse(/postMessage\((".*"),"https/.exec(script ?? '')?.[1] ?? 'null') as string;
const sessionOf = (script: string | null): string => (JSON.parse(replyOf(script)) as { payload: { session: string } }).payload.session;

describe('parseBridgeMessage', () => {
  it('accepts a bridge envelope from a frame on the app origin', () => {
    expect(parse(hello())).toEqual({ raw: hello(), senderUrl: PAGE, kind: 'hello' });
    expect(parse(call('wBBBBBBBB1', 'shell.version', 's'))).toMatchObject({ kind: 'call' });
  });

  it.each([
    ['another origin', 'https://evil.example/'],
    ['a look-alike host', 'https://app.iterahq.dev.evil.example/'],
    ['another port', 'https://app.iterahq.dev:8443/'],
    ['plain http', 'http://app.iterahq.dev/'],
    ['an opaque frame', 'about:srcdoc'],
    ['a missing URL', null],
    ['a non-string URL', 42],
  ])('drops a message from %s', (_what, url) => {
    expect(parse(hello(), url)).toBeNull();
  });

  it.each([
    ['a non-string', { tag: ENVELOPE_TAG }],
    ['not JSON', '{nope'],
    ['a foreign tag', '{"tag":"other","v":1}'],
    ['a console forwarder message', JSON.stringify({ type: 'console', level: 'error', text: 'x' })],
    ['an oversized message', `{"tag":"${ENVELOPE_TAG}","pad":"${'x'.repeat(MAX_MESSAGE_BYTES)}"}`],
  ])('drops %s', (_what, data) => {
    expect(parse(data)).toBeNull();
  });

  it('passes a bridge envelope with a bad version or id to the router, which answers with a named refusal', () => {
    expect(parse(JSON.stringify({ tag: ENVELOPE_TAG, v: 9, kind: 'hello', id: 'wAAAAAAAA1', payload: { webVersion: 't', protocols: [9] } }))).toMatchObject({ kind: 'other' });
  });

  it('a forged id passes the gate and is refused by the router as bad_id', async () => {
    const message = parse(hello('forged')) as BridgeMessage;
    expect(message).not.toBeNull();
    expect((await createShellBridge({ origin: O, shellVersion: '0.2.0', keepAwake: claimsOf() }).handle(message)).refused).toBe('bad_id');
  });

  it('the two parsers never read each other: a console message is no bridge message and a bridge message is no console message', () => {
    const consoleRaw = JSON.stringify({ type: 'console', level: 'error', text: 'x' });
    expect(parseConsoleMessage({ data: consoleRaw, url: PAGE }, O)).not.toBeNull();
    expect(parseBridgeMessage({ data: consoleRaw, url: PAGE }, O)).toBeNull();
    expect(parseConsoleMessage({ data: hello(), url: PAGE }, O)).toBeNull();
  });
});

describe('createShellBridge', () => {
  const bridge = (keepAwake: KeepAwakeClaims = claimsOf()) => createShellBridge({ origin: O, shellVersion: '0.2.0', keepAwake });

  it('offers keepAwake and shell.version and nothing else', () => {
    expect(bridge().capabilities).toEqual(['keepAwake', 'shell.version']);
  });

  it('a hello gets a delivery script that posts to the app origin only, and counts as a handshake', async () => {
    const out = await bridge().handle(parse(hello()) as BridgeMessage);
    expect(out.handshake).toBe(true);
    expect(out.refused).toBeNull();
    expect(out.script).toContain(`,${JSON.stringify(O)})`);
    expect(replyOf(out.script)).toContain('"capabilities":["keepAwake","shell.version"]');
  });

  it('round-trips shell.version through the real web client, as the page does', async () => {
    const b = bridge();
    const listeners = new Set<(m: IncomingMessage) => void>();
    const self = {};
    const deliver = async (raw: string) => {
      const message = parse(raw);
      if (message === null) return;
      const out = await b.handle(message);
      if (out.script) for (const l of listeners) l({ data: replyOf(out.script), origin: O, source: self });
    };
    const client = createBridgeClient({
      transport: { send: (raw) => void deliver(raw), listen: (h) => (listeners.add(h), () => listeners.delete(h)), self },
      origin: O,
      webVersion: 't',
      timeoutMs: 200,
    });
    expect(await client.handshake()).toMatchObject({ kind: 'shell', shellVersion: '0.2.0', capabilities: ['keepAwake', 'shell.version'] });
    expect(await client.call('shell.version', {})).toEqual({ shellVersion: '0.2.0', protocol: 1 });
  });

  it.each(['auth.session', 'link.open', 'haptics', 'file.save', 'share', 'capture.open'])(
    '%s is capability_absent: no token, no navigation, no file access in v1',
    async (method) => {
      const b = bridge();
      const ack = await b.handle(parse(hello()) as BridgeMessage);
      const session = sessionOf(ack.script);
      const out = await b.handle(parse(call('wBBBBBBBB1', method, session)) as BridgeMessage);
      expect(out.refused).toBe('capability_absent');
    },
  );

  describe('keepAwake', () => {
    const keepAwakeEffects = () => {
      const calls: string[] = [];
      const effects: KeepAwakeEffects = { activate: (tag) => void calls.push(`on:${tag}`), deactivate: (tag) => void calls.push(`off:${tag}`) };
      return { calls, effects, claims: claimsOf(effects) };
    };
    const shake = async (b: ReturnType<typeof bridge>) => sessionOf((await b.handle(parse(hello()) as BridgeMessage)).script);
    const ask = async (b: ReturnType<typeof bridge>, session: string, id: string, payload: unknown) =>
      b.handle(parse(call(id, 'keepAwake', session, payload)) as BridgeMessage);

    it('on:true holds with the tag, answers {on:true}, and on:false releases', async () => {
      const k = keepAwakeEffects();
      const b = bridge(k.claims);
      const session = await shake(b);
      const held = await ask(b, session, 'wBBBBBBBB1', { on: true });
      expect(held.refused).toBeNull();
      expect(JSON.parse(replyOf(held.script))).toMatchObject({ kind: 'result', payload: { on: true } });
      expect(b.keepAwakeHeld()).toBe(true);
      await ask(b, session, 'wBBBBBBBB2', { on: false });
      expect(b.keepAwakeHeld()).toBe(false);
      expect(k.calls).toEqual(['on:itera-lesson', 'off:itera-lesson']);
    });

    it.each([
      ['a string', { on: 'true' }],
      ['a number', { on: 1 }],
      ['no field', {}],
      ['an extra field', { on: true, tag: 'other' }],
      ['null', null],
      ['an array', [true]],
    ])('a payload that is %s is bad_payload and holds nothing', async (_what, payload) => {
      const k = keepAwakeEffects();
      const b = bridge(k.claims);
      const session = await shake(b);
      expect((await ask(b, session, 'wBBBBBBBB1', payload)).refused).toBe('bad_payload');
      expect(k.calls).toEqual([]);
    });

    it('a failing platform call answers handler_failed and holds nothing', async () => {
      const failing: KeepAwakeEffects = { activate: () => Promise.reject(new Error('no native module')), deactivate: () => undefined };
      const b = bridge(claimsOf(failing));
      const session = await shake(b);
      expect((await ask(b, session, 'wBBBBBBBB1', { on: true })).refused).toBe('handler_failed');
      expect(b.keepAwakeHeld()).toBe(false);
    });

    it('reset() (each top-frame load start, relaunch, unmount) releases the lock and forgets the handshake', async () => {
      const k = keepAwakeEffects();
      const b = bridge(k.claims);
      const session = await shake(b);
      await ask(b, session, 'wBBBBBBBB1', { on: true });
      b.reset();
      await Promise.resolve();
      await Promise.resolve();
      expect(b.keepAwakeHeld()).toBe(false);
      expect(k.calls).toEqual(['on:itera-lesson', 'off:itera-lesson']);
      expect((await ask(b, session, 'wBBBBBBBB2', { on: true })).refused).toBe('no_handshake');
    });

    it('a second accepted hello replaces the session and releases the lock', async () => {
      const k = keepAwakeEffects();
      const b = bridge(k.claims);
      const session = await shake(b);
      await ask(b, session, 'wBBBBBBBB1', { on: true });
      expect(b.keepAwakeHeld()).toBe(true);
      await b.handle(parse(hello('wAAAAAAAA2')) as BridgeMessage);
      await Promise.resolve();
      await Promise.resolve();
      expect(b.keepAwakeHeld()).toBe(false);
      expect(k.calls).toEqual(['on:itera-lesson', 'off:itera-lesson']);
    });

    it('a refused hello (replayed id) does not release', async () => {
      const k = keepAwakeEffects();
      const b = bridge(k.claims);
      const session = await shake(b);
      await ask(b, session, 'wBBBBBBBB1', { on: true });
      expect((await b.handle(parse(hello()) as BridgeMessage)).refused).toBe('replayed_id');
      expect(b.keepAwakeHeld()).toBe(true);
    });

    it('two bridges share one platform lock: one instance releasing keeps the other\'s claim, and its unmount releases only its own', async () => {
      const k = keepAwakeEffects();
      const hidden = bridge(k.claims);
      const visible = bridge(k.claims);
      const hiddenSession = await shake(hidden);
      const visibleSession = await shake(visible);
      await ask(hidden, hiddenSession, 'wBBBBBBBB1', { on: true });
      await ask(visible, visibleSession, 'wBBBBBBBB2', { on: true });
      expect(k.calls).toEqual(['on:itera-lesson']);
      await ask(visible, visibleSession, 'wBBBBBBBB3', { on: false });
      expect(hidden.keepAwakeHeld()).toBe(true);
      expect(k.calls).toEqual(['on:itera-lesson']);
      visible.reset();
      await Promise.resolve();
      expect(hidden.keepAwakeHeld()).toBe(true);
      hidden.reset();
      await new Promise((r) => setTimeout(r, 0));
      expect(k.calls).toEqual(['on:itera-lesson', 'off:itera-lesson']);
    });

    it('reset() with nothing held calls the platform nowhere', async () => {
      const k = keepAwakeEffects();
      const b = bridge(k.claims);
      await shake(b);
      b.reset();
      await Promise.resolve();
      expect(k.calls).toEqual([]);
    });
  });

  it('reset() forgets the handshake: the next call is no_handshake', async () => {
    const b = bridge();
    const ack = await b.handle(parse(hello()) as BridgeMessage);
    const session = sessionOf(ack.script);
    b.reset();
    expect((await b.handle(parse(call('wBBBBBBBB1', 'shell.version', session)) as BridgeMessage)).refused).toBe('no_handshake');
  });

  it('a replayed hello is refused', async () => {
    const b = bridge();
    await b.handle(parse(hello()) as BridgeMessage);
    expect((await b.handle(parse(hello()) as BridgeMessage)).refused).toBe('replayed_id');
  });
});

describe('the shell against its contract file', () => {
  const root = path.resolve(__dirname, '../../..');
  const version = (JSON.parse(readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8')) as { expo: { version: string } }).expo.version;
  const contract = JSON.parse(readFileSync(path.join(root, 'packages/bridge/contracts/shells', `${version}.json`), 'utf8')) as {
    shellVersion: string;
    bridge: boolean;
    capabilities: string[];
  };

  it('expo.version is x.y.z (the launch gate fails closed on anything else) and equals the version of apps/mobile/package.json', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect((JSON.parse(readFileSync(path.join(root, 'apps/mobile/package.json'), 'utf8')) as { version: string }).version).toBe(version);
  });

  it('expo.version has a contract file that says bridge: true and lists exactly the capabilities the shell registers', () => {
    expect(contract.shellVersion).toBe(version);
    expect(contract.bridge).toBe(true);
    expect([...contract.capabilities].sort()).toEqual([...createShellBridge({ origin: O, shellVersion: version, keepAwake: claimsOf() }).capabilities].sort());
  });
});
