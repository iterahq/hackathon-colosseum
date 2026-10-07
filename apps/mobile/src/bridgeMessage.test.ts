import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENVELOPE_TAG, MAX_MESSAGE_BYTES, createBridgeClient, type IncomingMessage } from '@iterahq/shell-bridge';
import { createKeepAwakeClaims, type KeepAwakeClaims, type KeepAwakeEffects } from './keepAwakeHolder';
import { randomFillSync } from 'node:crypto';
import { createShellBridge, readBridgeEnvelope, senderAttributed, type BridgeMessage } from './bridgeMessage';
import { readConsoleShape } from './consoleMessage';
import { ISSUER, NOW, OTHER_USER, USER, fakeJwt } from './jwt.testkit';
import { createNativeSession, type NativeSession } from './nativeSession';
import { receiveShellMessage } from './receiveShellMessage';

const O = 'https://app.iterahq.dev';
const PAGE = `${O}/lesson/1`;
const hello = (id = 'wAAAAAAAA1') => JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'hello', id, payload: { webVersion: 't', protocols: [1] } });
const call = (id: string, method: string, session: string, payload: unknown = {}) =>
  JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'call', id, session, method, payload });
const noEffects: KeepAwakeEffects = { activate: () => undefined, deactivate: () => undefined };
const claimsOf = (effects: KeepAwakeEffects = noEffects): KeepAwakeClaims => createKeepAwakeClaims(effects);
const parse = (data: unknown, url: string = PAGE, platform = 'ios') => readBridgeEnvelope(data, url, O, platform);
const random = (bytes: Uint8Array) => randomFillSync(bytes);
const nativeSession = (now = NOW): NativeSession => createNativeSession({ issuer: ISSUER, now: () => now, askTimeoutMs: 20 });
const shellBridge = (options: { keepAwake?: KeepAwakeClaims; session?: NativeSession; version?: string } = {}) =>
  createShellBridge({ origin: O, shellVersion: options.version ?? '0.3.0', keepAwake: options.keepAwake ?? claimsOf(), session: options.session ?? nativeSession(), random });
const replyOf = (script: string | null): string => JSON.parse(/postMessage\((".*"),"https/.exec(script ?? '')?.[1] ?? 'null') as string;
const sessionOf = (script: string | null): string => (JSON.parse(replyOf(script)) as { payload: { session: string } }).payload.session;

describe('readBridgeEnvelope (the frame is proved by messageSize, messageWindow.test.ts)', () => {
  it('accepts a bridge envelope', () => {
    expect(parse(hello())).toEqual({ raw: hello(), senderUrl: PAGE, kind: 'hello', attributed: true });
    expect(parse(call('wBBBBBBBB1', 'shell.version', 's'))).toMatchObject({ kind: 'call' });
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
    expect((await shellBridge().handle(message)).refused).toBe('bad_id');
  });

  it('the two parsers never read each other: a console message is no bridge message and a bridge message is no console message', () => {
    const consoleRaw = JSON.stringify({ type: 'console', level: 'error', text: 'x' });
    expect(readConsoleShape(consoleRaw)).not.toBeNull();
    expect(parse(consoleRaw)).toBeNull();
    expect(readConsoleShape(hello())).toBeNull();
  });
});

describe('createShellBridge', () => {
  const bridge = (keepAwake: KeepAwakeClaims = claimsOf()) => shellBridge({ keepAwake, version: '0.2.0' });

  it('offers auth.session, keepAwake and shell.version and nothing else', () => {
    expect(bridge().capabilities).toEqual(['auth.session', 'keepAwake', 'shell.version']);
  });

  it('a hello gets a delivery script that posts to the app origin only, and counts as a handshake', async () => {
    const out = await bridge().handle(parse(hello()) as BridgeMessage);
    expect(out.handshake).toBe(true);
    expect(out.refused).toBeNull();
    expect(out.script).toContain(`,${JSON.stringify(O)})`);
    expect(out.sessionOffered).toBe(true);
    expect(replyOf(out.script)).toContain('"capabilities":["auth.session","keepAwake","shell.version"]');
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
    expect(await client.handshake()).toMatchObject({ kind: 'shell', shellVersion: '0.2.0', capabilities: ['auth.session', 'keepAwake', 'shell.version'] });
    expect(await client.call('shell.version', {})).toEqual({ shellVersion: '0.2.0', protocol: 1 });
  });

  it.each(['link.open', 'haptics', 'file.save', 'share', 'capture.open'])(
    '%s is capability_absent: no navigation, no file access',
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

describe('createShellBridge: refusals the router names for what the gate lets through', () => {
  const reasonOf = (script: string | null): string => (JSON.parse(replyOf(script)) as { reason: string }).reason;
  const handMade = (raw: string): BridgeMessage => ({ raw, senderUrl: PAGE, kind: 'other', attributed: true });

  it('malformed: an envelope kind the shell never takes from the web (the gate lets it through as "other")', async () => {
    const result = JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: 'wAAAAAAAA1', payload: {} });
    const message = parse(result) as BridgeMessage;
    expect(message).toMatchObject({ kind: 'other' });
    expect((await shellBridge().handle(message)).refused).toBe('malformed');
  });

  it('malformed: a raw message that is not an envelope is refused by the router itself, whatever the gate said', async () => {
    expect((await shellBridge().handle(handMade('{nope'))).refused).toBe('malformed');
    expect((await shellBridge().handle(handMade(JSON.stringify({ tag: 'other', v: 1 })))).refused).toBe('malformed');
  });

  it('version_mismatch: a hello of a protocol version the shell does not speak is answered with the named refusal and no handshake', async () => {
    const hello9 = JSON.stringify({ tag: ENVELOPE_TAG, v: 9, kind: 'hello', id: 'wAAAAAAAA1', payload: { webVersion: 't', protocols: [9] } });
    const out = await shellBridge().handle(parse(hello9) as BridgeMessage);
    expect(out.refused).toBe('version_mismatch');
    expect(out.handshake).toBe(false);
    expect(reasonOf(out.script)).toBe('version_mismatch');
  });

  it('version_mismatch: a hello of version 1 that offers only protocols the shell does not speak', async () => {
    const out = await shellBridge().handle(parse(hello('wAAAAAAAA1').replace('"protocols":[1]', '"protocols":[7]')) as BridgeMessage);
    expect(out.refused).toBe('version_mismatch');
    expect(out.handshake).toBe(false);
  });

  it('unknown_method: a call with the right session and a method that is not in the protocol', async () => {
    const b = shellBridge();
    const session = sessionOf((await b.handle(parse(hello()) as BridgeMessage)).script);
    const out = await b.handle(parse(call('wBBBBBBBB1', 'format.disk', session)) as BridgeMessage);
    expect(out.refused).toBe('unknown_method');
    expect(reasonOf(out.script)).toBe('unknown_method');
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
    expect([...contract.capabilities].sort()).toEqual([...shellBridge({ version }).capabilities].sort());
  });
});

describe('senderAttributed', () => {
  it.each([
    ['ios, the page', 'ios', PAGE, true],
    ['ios, the origin alone', 'ios', O, true],
    ['android on the WebMessageListener path: the origin of the sender frame, no path', 'android', O, true],
    ['android on the legacy path at the root: the URL of the top frame', 'android', `${O}/`, false],
    ['android on the legacy path on a lesson', 'android', PAGE, false],
    ['android, the origin with a query', 'android', `${O}?x=1`, false],
    ['android, the origin in another case', 'android', 'HTTPS://APP.ITERAHQ.DEV', false],
    ['an unknown platform', 'web', O, false],
    ['no platform', '', PAGE, false],
  ])('%s', (_what, platform, url, expected) => {
    expect(senderAttributed(platform, url, O)).toBe(expected);
  });
});

describe('auth.session (R-12)', () => {
  const JWT = fakeJwt();
  const EXPIRES_AT = 2_000_000_000_000;
  const shake = async (b: ReturnType<typeof shellBridge>, id = 'wAAAAAAAA1', url: string = PAGE, platform = 'ios') => {
    const out = await b.handle(parse(hello(id), url, platform) as BridgeMessage);
    return { out, session: sessionOf(out.script) };
  };
  const push = (b: ReturnType<typeof shellBridge>, session: string, id: string, payload: unknown, url: string = PAGE, platform = 'ios') =>
    b.handle(parse(call(id, 'auth.session', session, payload), url, platform) as BridgeMessage);

  it('stores the access token of the page and answers {stored:true}; the reply carries no token', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    const out = await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    expect(out.refused).toBeNull();
    expect(JSON.parse(replyOf(out.script))).toMatchObject({ kind: 'result', payload: { stored: true } });
    expect(out.script).not.toContain(JWT);
    expect(native.session.current()).toEqual({ userId: USER, accessToken: JWT, expiresAt: EXPIRES_AT });
  });

  it('signedOut clears the copy', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    expect((await push(b, session, 'wBBBBBBBB2', { signedOut: true })).refused).toBeNull();
    expect(native.session.current()).toBeNull();
    expect(await native.session.getAccessToken()).toBeNull();
  });

  it('another user replaces the copy: the first user is gone', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    const other = fakeJwt({ sub: OTHER_USER });
    await push(b, session, 'wBBBBBBBB2', { accessToken: other, expiresAt: EXPIRES_AT });
    expect(native.session.current()).toMatchObject({ userId: OTHER_USER, accessToken: other });
  });

  it.each([
    ['a refresh token beside the access token', { accessToken: JWT, expiresAt: EXPIRES_AT, refreshToken: 'r' }, 'bad_payload'],
    ['a snake-case refresh token', { accessToken: JWT, expiresAt: EXPIRES_AT, refresh_token: 'r' }, 'bad_payload'],
    ['a provider token', { accessToken: JWT, expiresAt: EXPIRES_AT, provider_token: 'p' }, 'bad_payload'],
    ['a whole session object', { access_token: JWT, refresh_token: 'r', expires_at: 2_000_000_000, user: { id: USER } }, 'bad_payload'],
    ['a user id field', { accessToken: JWT, expiresAt: EXPIRES_AT, userId: USER }, 'bad_payload'],
    ['two dot parts', { accessToken: JWT.split('.').slice(0, 2).join('.'), expiresAt: EXPIRES_AT }, 'bad_payload'],
    ['an expiry after the token exp', { accessToken: JWT, expiresAt: EXPIRES_AT + 1 }, 'bad_payload'],
    ['an expired token', { accessToken: fakeJwt({ exp: 1_999_998_000 }), expiresAt: 1_999_998_000_000 }, 'handler_failed'],
    ['a sub that is no uuid', { accessToken: fakeJwt({ sub: 'admin' }), expiresAt: EXPIRES_AT }, 'handler_failed'],
    ['another project as issuer', { accessToken: fakeJwt({ iss: 'https://evil.supabase.co/auth/v1' }), expiresAt: EXPIRES_AT }, 'handler_failed'],
    ['the anon audience', { accessToken: fakeJwt({ aud: 'anon' }), expiresAt: EXPIRES_AT }, 'handler_failed'],
    ['a guest of a live class', { accessToken: fakeJwt({ app_metadata: { is_guest: true } }), expiresAt: EXPIRES_AT }, 'handler_failed'],
  ])('refuses %s and stores nothing', async (_what, payload, reason) => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    const out = await push(b, session, 'wBBBBBBBB1', payload);
    expect(out.refused).toBe(reason);
    expect(native.session.current()).toBeNull();
    expect(out.script).not.toMatch(/eyJ[\w-]{20,}\.[\w-]{20,}\./);
  });

  it('a refused token does not replace the copy already held', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    await push(b, session, 'wBBBBBBBB2', { accessToken: fakeJwt({ sub: OTHER_USER, iss: 'https://evil.supabase.co/auth/v1' }), expiresAt: EXPIRES_AT });
    expect(native.session.current()).toMatchObject({ userId: USER });
  });

  it('needs the session of the handshake: a guessed or missing session stores nothing', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    expect((await push(b, 's'.padEnd(65, '0'), 'wBBBBBBBB0', { accessToken: JWT, expiresAt: EXPIRES_AT })).refused).toBe('no_handshake');
    await shake(b);
    expect((await push(b, 's'.padEnd(65, '0'), 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT })).refused).toBe('bad_session');
    expect(native.session.current()).toBeNull();
  });

  it('the session token is 256 random bits from the supplied source, new on every handshake', async () => {
    const b = shellBridge();
    const first = (await shake(b, 'wAAAAAAAA1')).session;
    const second = (await shake(b, 'wAAAAAAAA2')).session;
    expect(first).toMatch(/^s[0-9a-f]{64}$/);
    expect(second).toMatch(/^s[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it('a frame of another origin, or a sandboxed frame of learner code, never reaches the router', () => {
    for (const url of ['about:srcdoc', 'null', 'about:blank', 'blob:https://app.iterahq.dev/1b0f', 'data:text/html,x', 'https://evil.example/']) {
      for (const platform of ['ios', 'android']) {
        for (const data of [hello(), call('wBBBBBBBB1', 'auth.session', 's', { signedOut: true })]) {
          const answer = receiveShellMessage({ event: { data, url }, raw: { start: 0, count: 0, chars: 0 }, page: { start: 0, count: 0 }, origin: O, platform, dev: true, now: 5000 });
          expect(answer.kind, `${platform} ${url}`).toBe('drop');
        }
      }
    }
  });

  describe('Android legacy WebView: the sender frame is unknown', () => {
    const LEGACY = [PAGE, 'android'] as const;

    it('the handshake does not list auth.session', async () => {
      const { out } = await shake(shellBridge(), 'wAAAAAAAA1', ...LEGACY);
      expect(out.handshake).toBe(true);
      expect(out.sessionOffered).toBe(false);
      expect(replyOf(out.script)).toContain('"capabilities":["keepAwake","shell.version"]');
    });

    it('a call of auth.session is capability_absent and stores nothing', async () => {
      const native = nativeSession();
      const b = shellBridge({ session: native });
      const { session } = await shake(b, 'wAAAAAAAA1', ...LEGACY);
      expect((await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT }, ...LEGACY)).refused).toBe('capability_absent');
      expect(native.session.current()).toBeNull();
    });

    it('the shell never asks such a page for a token', async () => {
      const b = shellBridge();
      await shake(b, 'wAAAAAAAA1', ...LEGACY);
      expect(b.askSession(false)).toBeNull();
    });

    it('a legacy-shaped message cannot use the session of an attributed handshake', async () => {
      const native = nativeSession();
      const b = shellBridge({ session: native });
      const { session } = await shake(b, 'wAAAAAAAA1', O, 'android');
      expect((await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT }, ...LEGACY)).refused).toBe('no_handshake');
      expect((await push(b, session, 'wBBBBBBBB2', { signedOut: true }, ...LEGACY)).refused).toBe('no_handshake');
      expect(native.session.current()).toBeNull();
    });

    it('a legacy-shaped hello does not end the session of the attributed page, nor its token', async () => {
      const native = nativeSession();
      const b = shellBridge({ session: native });
      const { session } = await shake(b, 'wAAAAAAAA1', O, 'android');
      await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT }, O, 'android');
      await shake(b, 'wAAAAAAAA2', ...LEGACY);
      expect(native.session.current()).toMatchObject({ userId: USER });
      expect((await push(b, session, 'wBBBBBBBB2', { signedOut: true }, O, 'android')).refused).toBeNull();
      expect(native.session.current()).toBeNull();
    });

    it('keepAwake still works there', async () => {
      const b = shellBridge();
      const { session } = await shake(b, 'wAAAAAAAA1', ...LEGACY);
      const out = await b.handle(parse(call('wBBBBBBBB1', 'keepAwake', session, { on: true }), ...LEGACY) as BridgeMessage);
      expect(out.refused).toBeNull();
      expect(b.keepAwakeHeld()).toBe(true);
    });
  });

  it('Android on the WebMessageListener path is offered auth.session and stores the token', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { out, session } = await shake(b, 'wAAAAAAAA1', O, 'android');
    expect(out.sessionOffered).toBe(true);
    expect((await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT }, O, 'android')).refused).toBeNull();
    expect(native.session.current()).toMatchObject({ userId: USER });
  });

  describe('a build that names no backend (no issuer to hold a token to)', () => {
    const bare = () => createShellBridge({ origin: O, shellVersion: '0.3.0', keepAwake: claimsOf(), session: null, random });

    it('does not have the capability: not on iOS, not on Android', async () => {
      expect(bare().capabilities).toEqual(['keepAwake', 'shell.version']);
      for (const [url, platform] of [[PAGE, 'ios'], [O, 'android'], [PAGE, 'android']] as const) {
        const { out } = await shake(bare(), 'wAAAAAAAA1', url, platform);
        expect(out.sessionOffered, platform).toBe(false);
        expect(replyOf(out.script), platform).toContain('"capabilities":["keepAwake","shell.version"]');
      }
    });

    it('a call of auth.session is capability_absent, and the shell never asks', async () => {
      const b = bare();
      const { session } = await shake(b);
      expect((await push(b, session, 'wBBBBBBBB1', { accessToken: fakeJwt({ iss: 'https://any.supabase.co/auth/v1' }), expiresAt: EXPIRES_AT })).refused).toBe('capability_absent');
      expect((await push(b, session, 'wBBBBBBBB2', { signedOut: true })).refused).toBe('capability_absent');
      expect(b.askSession(false)).toBeNull();
      b.reset();
    });
  });

  it('reset() (top-frame load start, relaunch, unmount) drops the copy this WebView delivered', async () => {
    const native = nativeSession();
    const events: string[] = [];
    native.session.subscribe((e) => void events.push(e.type));
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    b.reset();
    expect(native.session.current()).toBeNull();
    expect(events).toEqual(['signed-in', 'signed-out']);
    expect(b.askSession(false)).toBeNull();
  });

  it('reset() of a WebView that delivered nothing keeps the copy another WebView delivered', async () => {
    const native = nativeSession();
    const visible = shellBridge({ session: native });
    const hidden = shellBridge({ session: native });
    const { session } = await shake(visible);
    await shake(hidden, 'wAAAAAAAA2');
    await push(visible, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    hidden.reset();
    expect(native.session.current()).toMatchObject({ userId: USER });
    visible.reset();
    expect(native.session.current()).toBeNull();
  });

  it('a second hello keeps the copy; the old session can no longer change it', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    await shake(b, 'wAAAAAAAA2');
    expect(native.session.current()).toMatchObject({ userId: USER });
    expect((await push(b, session, 'wBBBBBBBB2', { signedOut: true })).refused).toBe('bad_session');
  });

  it('another method cannot carry the held token out (a URL, a share text)', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    const { session } = await shake(b);
    await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    const out = await b.handle(parse(call('wBBBBBBBB2', 'keepAwake', session, { on: true, note: JWT })) as BridgeMessage);
    expect(out.refused).toBe('bad_payload');
    expect(out.script).not.toContain(JWT);
  });

  it('the shell asks the page through the attributed router, to the app origin only, and the ask carries no token', async () => {
    const native = nativeSession();
    const b = shellBridge({ session: native });
    expect(b.askSession(false)).toBeNull();
    const { session } = await shake(b);
    await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
    const script = b.askSession(true) as string;
    expect(script).toContain(`,${JSON.stringify(O)})`);
    expect(script).not.toContain(JWT);
    expect(JSON.parse(replyOf(script))).toMatchObject({ kind: 'ask', method: 'auth.session', session, payload: { forceRefresh: true } });
    expect((JSON.parse(replyOf(script)) as { id: string }).id).toMatch(/^n[0-9a-f]{32}$/);
  });

  describe('no token in a log', () => {
    const logged = async (run: () => Promise<void>) => {
      const lines: string[] = [];
      const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
      const original = methods.map((m) => console[m]);
      methods.forEach((m) => (console[m] = (...args: unknown[]) => void lines.push(args.map(String).join(' '))));
      try {
        await run();
      } finally {
        methods.forEach((m, i) => (console[m] = original[i]));
      }
      return lines;
    };

    it('the new shell code prints nothing while it stores, refuses, asks and clears', async () => {
      const lines = await logged(async () => {
        const native = nativeSession();
        const b = shellBridge({ session: native });
        const { session } = await shake(b);
        await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
        await push(b, session, 'wBBBBBBBB2', { accessToken: fakeJwt({ sub: 'x' }), expiresAt: EXPIRES_AT });
        await push(b, 'wrong', 'wBBBBBBBB3', { accessToken: JWT, expiresAt: EXPIRES_AT });
        b.askSession(false);
        await native.session.getAccessToken();
        b.reset();
      });
      expect(lines).toEqual([]);
    });

    it('what the host logs of an outcome (the refusal reason) never holds the token, also when the handler error quotes it', async () => {
      const native = nativeSession();
      const quoting: NativeSession = { ...native, handlerFor: () => () => { throw new Error(`cannot store ${JWT}`); } };
      const b = shellBridge({ session: quoting });
      const { session } = await shake(b);
      const out = await push(b, session, 'wBBBBBBBB1', { accessToken: JWT, expiresAt: EXPIRES_AT });
      expect(out.refused).toBe('handler_failed');
      expect(`[bridge] refused: ${out.refused}`).not.toContain('eyJ');
      expect(out.script).not.toContain(JWT);
      expect(replyOf(out.script)).toContain('[redacted]');
    });

    it('an auth.session envelope sent down the console path is not a console message', () => {
      const envelope = call('wBBBBBBBB1', 'auth.session', 's1', { accessToken: JWT, expiresAt: EXPIRES_AT });
      expect(readConsoleShape(envelope)).toBeNull();
    });

    it('an auth.session envelope quoted inside a forwarded console error is redacted', () => {
      const envelope = call('wBBBBBBBB1', 'auth.session', 's1', { accessToken: JWT, expiresAt: EXPIRES_AT });
      for (const text of [envelope.slice(0, 400), `bridge call failed: ${JSON.stringify({ accessToken: JWT })}`, `Authorization: Bearer ${JWT}`]) {
        const message = readConsoleShape(JSON.stringify({ type: 'console', level: 'error', text }));
        const line = `[web ${message?.level}] ${message?.text}`;
        expect(line).not.toMatch(/eyJ[\w-]+\.[\w-]+/);
        expect(line).not.toContain(JWT.split('.')[1].slice(0, 24));
      }
    });
  });
});
