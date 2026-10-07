import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { BridgeRefusal, ENVELOPE_TAG, createShellRouter, createShellSession, deliveryScript, type BridgeClient, type BridgeMode, type Method, type ShellSession } from '@iterahq/shell-bridge';
import type { RenewableBridgeClient } from './shellBridge';

const ORIGIN = 'https://app.iterahq.dev';
const USER = '5b0f7c3e-2f4d-4c1a-9d53-8a6f2b1c0e77';
const OTHER_USER = '0d9c1a52-77aa-4b0e-8f11-3c2e9d4a6b10';
const REFRESH = 'v1.refresh-Mq3xT7kPz2LwN8sVbY4c';
const PROVIDER = 'ya29.provider-A0ARrdaM9xQ';
const PROVIDER_REFRESH = '1//provider-refresh-0gK7';
const EMAIL = 'aluna@example.com';
const FORBIDDEN = ['refresh_token', 'refreshToken', 'provider_token', 'provider_refresh_token', REFRESH, PROVIDER, PROVIDER_REFRESH, EMAIL, 'user_metadata'];

const b64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const expSeconds = (inSeconds: number) => Math.floor(Date.now() / 1000) + inSeconds;
const jwt = (claims: Record<string, unknown>) =>
  `${b64url({ alg: 'ES256', typ: 'JWT' })}.${b64url({ iss: 'https://kjefmwlopzeaqgqtlbdn.supabase.co/auth/v1', aud: 'authenticated', email: EMAIL, ...claims })}.c2lnbmF0dXJl`;

/** The object supabase-js hands to `onAuthStateChange`: everything a real session carries. */
function supabaseSession(sub = USER, exp = expSeconds(3600), extra: Record<string, unknown> = {}) {
  return {
    access_token: jwt({ sub, exp, ...extra }),
    refresh_token: REFRESH,
    provider_token: PROVIDER,
    provider_refresh_token: PROVIDER_REFRESH,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: { id: sub, aud: 'authenticated', email: EMAIL, app_metadata: { provider: 'email' }, user_metadata: { name: 'Ana' }, identities: [] },
  };
}
type FullSession = ReturnType<typeof supabaseSession>;

type Listener = (ev: { data: unknown; origin: string; source: unknown }) => void;

/** A window of the shell: `ReactNativeWebView` answers through a real router, with the real shell session behind `auth.session`. */
function shellWindow(capabilities: Method[]) {
  const session: ShellSession = createShellSession({ askTimeoutMs: 200 });
  const handlers: Record<string, (p: unknown) => unknown> = { 'shell.version': () => ({ shellVersion: '0.3.0', protocol: 1 }) };
  if (capabilities.includes('auth.session')) handlers['auth.session'] = session.handler;
  const router = createShellRouter({ origin: ORIGIN, shellVersion: '0.3.0', handlers, secrets: session.secrets });
  const listeners = new Set<Listener>();
  const posted: string[] = [];
  const refusals: string[] = [];
  const win = {
    location: { origin: ORIGIN },
    ReactNativeWebView: {
      postMessage(raw: string) {
        posted.push(raw);
        void router.receive(raw, `${ORIGIN}/`).then((out) => {
          if (out.refused) refusals.push(out.refused);
          if (out.reply) for (const l of listeners) l({ data: out.reply, origin: ORIGIN, source: win });
        });
      },
    },
    addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
  };
  session.bindAsk((forceRefresh) => {
    const raw = router.ask('auth.session', { forceRefresh });
    if (raw === null) return false;
    expect(deliveryScript(raw, router.origin)).toContain(`,${JSON.stringify(ORIGIN)})`);
    for (const l of listeners) l({ data: raw, origin: ORIGIN, source: win });
    return true;
  });
  const calls = () => posted.map((raw) => JSON.parse(raw) as { kind: string; method?: string; payload?: Record<string, unknown> }).filter((e) => e.kind === 'call');
  return { win: win as unknown as Window, posted, refusals, session, calls };
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const state = vi.hoisted(() => ({
  auth: { session: null, loading: false, configured: true } as { session: unknown; loading: boolean; configured: boolean },
  stored: null as unknown,
  refreshed: null as unknown,
  refreshCalls: 0,
}));

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: state.stored } }),
      refreshSession: async () => {
        state.refreshCalls += 1;
        if (state.refreshed) state.stored = state.refreshed;
        return { data: { session: state.refreshed }, error: state.refreshed ? null : new Error('refresh failed') };
      },
    },
  }),
}));

describe('ShellAuthSessionMount', () => {
  beforeEach(() => {
    vi.resetModules();
    state.auth = { session: null, loading: false, configured: true };
    state.stored = null;
    state.refreshed = null;
    state.refreshCalls = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Sign in (or out) before the app mounts. */
  const boot = <T extends FullSession | null>(session: T, loading = false): T => {
    state.stored = session;
    state.auth = { session: loading ? null : session, loading, configured: true };
    return session;
  };

  const mount = async (win: Window | null) => {
    const bridge = await import('./shellBridge');
    if (win) bridge.startShellBridge(win);
    const { ShellAuthSessionMount } = await import('./shellAuthSession');
    const view = render(createElement(ShellAuthSessionMount));
    const change = async (next: FullSession | null) => {
      state.stored = next;
      state.auth = { ...state.auth, session: next };
      await act(async () => {
        view.rerender(createElement(ShellAuthSessionMount));
      });
      await settle();
    };
    await settle();
    return { change, view };
  };

  it('in a browser tab, with a real session, nothing is posted anywhere', async () => {
    const post = vi.spyOn(window, 'postMessage');
    const add = vi.spyOn(window, 'addEventListener');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    boot(supabaseSession());
    const { change } = await mount(null);
    await change(supabaseSession(USER, expSeconds(7200)));
    await change(null);
    expect(post).not.toHaveBeenCalled();
    expect(add.mock.calls.filter(([type]) => type === 'message')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(state.refreshCalls).toBe(0);
  });

  it('a session that already exists is sent after the handshake: the access token and its expiry, nothing else', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    const stored = boot(supabaseSession());
    await mount(shell.win);
    const calls = shell.calls();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.method).toBe('auth.session');
      expect(Object.keys(call.payload ?? {}).sort()).toEqual(['accessToken', 'expiresAt']);
      expect(call.payload).toEqual({ accessToken: stored.access_token, expiresAt: stored.expires_at * 1000 });
    }
    expect(shell.session.current()).toMatchObject({ userId: USER, accessToken: stored.access_token });
    expect(shell.refusals).toEqual([]);
  });

  it('no message of a whole session life carries a refresh token, a provider token, the user object or the e-mail', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    boot(supabaseSession());
    const { change } = await mount(shell.win);
    await change(supabaseSession(USER, expSeconds(7200)));
    const refreshed = (state.refreshed = supabaseSession(USER, expSeconds(9000)));
    await shell.session.refresh();
    await change(supabaseSession(OTHER_USER));
    await change(null);
    expect(shell.posted.length).toBeGreaterThan(4);
    const traffic = shell.posted.join('\n');
    for (const word of FORBIDDEN) expect(traffic, word).not.toContain(word);
    for (const raw of shell.posted) {
      const envelope = JSON.parse(raw) as { kind: string; payload?: Record<string, unknown> };
      if (envelope.kind !== 'call') continue;
      const keys = Object.keys(envelope.payload ?? {}).sort().join(',');
      expect(['accessToken,expiresAt', 'signedOut']).toContain(keys);
    }
  });

  it('sign-in after the handshake, a token refresh and a sign-out each reach the shell, in order', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    const events: string[] = [];
    shell.session.subscribe((e) => void events.push(e.type));
    const { change } = await mount(shell.win);
    expect(shell.calls().at(-1)?.payload).toEqual({ signedOut: true });
    const first = supabaseSession();
    await change(first);
    expect(shell.session.current()).toMatchObject({ accessToken: first.access_token });
    const second = supabaseSession(USER, expSeconds(7200));
    await change(second);
    expect(shell.session.current()).toMatchObject({ accessToken: second.access_token });
    await change(null);
    expect(shell.session.current()).toBeNull();
    expect(shell.calls().at(-1)?.payload).toEqual({ signedOut: true });
    expect(events).toEqual(['signed-out', 'signed-in', 'token-refreshed', 'signed-out']);
  });

  it('another user replaces the copy of the first', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    boot(supabaseSession());
    const { change } = await mount(shell.win);
    const other = supabaseSession(OTHER_USER);
    await change(other);
    expect(shell.session.current()).toMatchObject({ userId: OTHER_USER, accessToken: other.access_token });
  });

  it('a guest of a live class is told as signed out: its token never leaves the page', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    boot(supabaseSession());
    const { change } = await mount(shell.win);
    const guest = supabaseSession(OTHER_USER, expSeconds(3600), { app_metadata: { is_guest: true } });
    await change(guest);
    expect(shell.posted.join('\n')).not.toContain(guest.access_token);
    expect(shell.calls().at(-1)?.payload).toEqual({ signedOut: true });
    expect(shell.session.current()).toBeNull();
  });

  it('a shell that does not list auth.session (0.2.0 and older) is sent the hello and nothing else', async () => {
    const shell = shellWindow(['shell.version']);
    boot(supabaseSession());
    const { change } = await mount(shell.win);
    await change(supabaseSession(USER, expSeconds(7200)));
    await change(null);
    expect(shell.posted.map((raw) => (JSON.parse(raw) as { kind: string }).kind)).toEqual(['hello']);
    expect(shell.posted.join('\n')).not.toContain('accessToken');
  });

  it('while the app is still reading its stored session, no sign-out is announced', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    const events: string[] = [];
    boot(supabaseSession(), true);
    shell.session.subscribe((e) => void events.push(e.type));
    await mount(shell.win);
    expect(events).toEqual(['signed-in']);
  });

  it('the shell asks for a refresh: supabase-js refreshes on the page and only the new access token crosses', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    boot(supabaseSession());
    await mount(shell.win);
    const refreshed = (state.refreshed = supabaseSession(USER, expSeconds(9000)));
    expect(await shell.session.refresh()).toBe(refreshed.access_token);
    expect(state.refreshCalls).toBe(1);
    expect(shell.posted.join('\n')).not.toContain(REFRESH);
  });

  it('when the page cannot renew an expired session it sends nothing: the shell gets null, not the old token', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    boot(supabaseSession(USER, expSeconds(3)));
    await mount(shell.win);
    const before = shell.posted.length;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
    expect(await shell.session.getAccessToken()).toBeNull();
    expect(shell.posted.length).toBe(before);
  });

  it('threat, stated: a page object that fakes the shell and its HelloAck does receive the access token, and only that', async () => {
    const listeners = new Set<Listener>();
    const captured: string[] = [];
    const spoof = {
      location: { origin: ORIGIN },
      ReactNativeWebView: {
        postMessage(raw: string) {
          captured.push(raw);
          const envelope = JSON.parse(raw) as { kind: string; id: string };
          const payload = envelope.kind === 'hello' ? { protocol: 1, session: 'sattacker', shellVersion: '9.9.9', capabilities: ['auth.session'] } : { stored: true };
          const reply = JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: envelope.id, payload });
          setTimeout(() => { for (const l of listeners) l({ data: reply, origin: ORIGIN, source: spoof }); }, 0);
        },
      },
      addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
    };
    const stored = boot(supabaseSession());
    await mount(spoof as unknown as Window);
    const traffic = captured.join('\n');
    expect(traffic).toContain(stored.access_token);
    for (const word of FORBIDDEN) expect(traffic, word).not.toContain(word);
  });
});

describe('withSignOutRetry', () => {
  const fakeClient = (outcomes: Array<'timeout' | 'bad_session' | 'ok'>) => {
    const calls: Array<{ method: string; payload: unknown }> = [];
    const client = {
      call: async (method: string, payload: unknown) => {
        calls.push({ method, payload });
        const outcome = outcomes.shift() ?? 'ok';
        if (outcome !== 'ok') throw new BridgeRefusal(outcome, method);
        return { stored: false };
      },
      has: () => true,
    } as unknown as BridgeClient;
    return { client, calls };
  };
  const load = async () => (await import('./shellAuthSession')).withSignOutRetry;
  const waits = () => {
    const asked: number[] = [];
    return { asked, wait: async (ms: number) => void asked.push(ms) };
  };

  it('a sign-out that times out is sent again, with backoff, until the shell acknowledges it', async () => {
    const { client, calls } = fakeClient(['timeout', 'timeout', 'ok']);
    const w = waits();
    const retrying = (await load())(client, [1000, 3000], w.wait);
    await expect(retrying.call('auth.session', { signedOut: true })).resolves.toEqual({ stored: false });
    expect(calls).toEqual(Array.from({ length: 3 }, () => ({ method: 'auth.session', payload: { signedOut: true } })));
    expect(w.asked).toEqual([1000, 3000]);
  });

  it('gives up after three tries: bounded, and the failure still reaches the caller', async () => {
    const { client, calls } = fakeClient(['timeout', 'timeout', 'timeout', 'timeout']);
    const w = waits();
    await expect((await load())(client, [1000, 3000], w.wait).call('auth.session', { signedOut: true })).rejects.toMatchObject({ reason: 'timeout' });
    expect(calls.length).toBe(3);
  });

  it('a refusal is an answer: no retry', async () => {
    const { client, calls } = fakeClient(['bad_session']);
    const w = waits();
    await expect((await load())(client, [1000, 3000], w.wait).call('auth.session', { signedOut: true })).rejects.toMatchObject({ reason: 'bad_session' });
    expect(calls.length).toBe(1);
    expect(w.asked).toEqual([]);
  });

  it('a token push is never re-sent: only the next refresh replaces it', async () => {
    const { client, calls } = fakeClient(['timeout']);
    const w = waits();
    const token = supabaseSession().access_token;
    await expect((await load())(client, [1000, 3000], w.wait).call('auth.session', { accessToken: token, expiresAt: 1 })).rejects.toMatchObject({ reason: 'timeout' });
    await expect((await load())(client, [1000, 3000], w.wait).call('keepAwake', { on: false })).resolves.toBeDefined();
    expect(calls.length).toBe(2);
    expect(w.asked).toEqual([]);
  });

  it('keeps the rest of the client as it is', async () => {
    const { client } = fakeClient([]);
    const retrying = (await load())(client);
    expect(retrying.has).toBe(client.has);
  });
});

describe('ShellAuthSessionMount sign-out against a shell that loses the first message', () => {
  beforeEach(() => {
    vi.resetModules();
    state.auth = { session: null, loading: false, configured: true };
    state.stored = null;
    state.refreshed = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('the copy still ends: the page re-sends after the timeout', async () => {
    const shell = shellWindow(['shell.version', 'auth.session']);
    const inner = (shell.win as unknown as { ReactNativeWebView: { postMessage(raw: string): void } }).ReactNativeWebView;
    const deliver = inner.postMessage.bind(inner);
    let lost = 0;
    inner.postMessage = (raw: string) => {
      if (raw.includes('"signedOut":true') && lost === 0) {
        lost += 1;
        return;
      }
      deliver(raw);
    };
    const session = supabaseSession();
    state.stored = session;
    state.auth = { session, loading: false, configured: true };
    const bridge = await import('./shellBridge');
    bridge.startShellBridge(shell.win);
    const { ShellAuthSessionMount } = await import('./shellAuthSession');
    const view = render(createElement(ShellAuthSessionMount));
    await settle();
    expect(shell.session.current()).not.toBeNull();
    state.stored = null;
    state.auth = { session: null, loading: false, configured: true };
    await act(async () => {
      view.rerender(createElement(ShellAuthSessionMount));
    });
    await settle();
    expect(lost).toBe(1);
    expect(shell.session.current()).not.toBeNull();
    await settle(6400);
    expect(shell.session.current()).toBeNull();
  }, 15_000);
});

describe('toShellSnapshot', () => {
  it('reads two fields and the user id; a session without an expiry or a token is no session', async () => {
    const { toShellSnapshot } = await import('./shellAuthSession');
    const session = supabaseSession();
    expect(toShellSnapshot(session)).toEqual({ userId: USER, snapshot: { accessToken: session.access_token, expiresAt: session.expires_at * 1000 } });
    expect(toShellSnapshot(null)).toBeNull();
    expect(toShellSnapshot({ ...session, expires_at: undefined })).toBeNull();
    expect(toShellSnapshot({ ...session, access_token: '' })).toBeNull();
  });
});

describe('withSessionRenewal', () => {
  const shellMode: BridgeMode = { kind: 'shell', protocol: 1, shellVersion: '0.3.0', capabilities: ['auth.session'] };
  const fakeRenewable = (outcomes: Array<'bad_session' | 'timeout' | 'ok'>, renewed: BridgeMode = shellMode) => {
    const calls: unknown[] = [];
    let generation = 0;
    const handshakes = { count: 0 };
    const client = {
      call: async (method: string, payload: unknown) => {
        calls.push({ method, payload });
        const outcome = outcomes.shift() ?? 'ok';
        if (outcome !== 'ok') throw new BridgeRefusal(outcome, method);
        return { stored: true };
      },
      has: () => true,
      generation: () => generation,
      renew: async () => {
        handshakes.count += 1;
        generation += 1;
        return renewed;
      },
    } as unknown as RenewableBridgeClient;
    return { client, calls, handshakes };
  };
  const load = async () => (await import('./shellAuthSession')).withSessionRenewal;
  const push = { accessToken: 'a.b.c', expiresAt: 1 };

  it('bad_session: one new handshake and one retry of the same payload', async () => {
    const { client, calls, handshakes } = fakeRenewable(['bad_session', 'ok']);
    await expect((await load())(client, () => true).call('auth.session', push)).resolves.toEqual({ stored: true });
    expect(handshakes.count).toBe(1);
    expect(calls).toEqual([{ method: 'auth.session', payload: push }, { method: 'auth.session', payload: push }]);
  });

  it('a second bad_session is thrown: two calls, one handshake, no third call', async () => {
    const { client, calls, handshakes } = fakeRenewable(['bad_session', 'bad_session', 'ok']);
    await expect((await load())(client, () => true).call('auth.session', push)).rejects.toMatchObject({ reason: 'bad_session' });
    expect(handshakes.count).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('a page renews at most `limit` times, however many calls meet bad_session', async () => {
    const { client, handshakes } = fakeRenewable(Array.from({ length: 20 }, () => 'bad_session' as const));
    const renewing = (await load())(client, () => true, 2);
    for (let i = 0; i < 5; i += 1) await expect(renewing.call('auth.session', push)).rejects.toMatchObject({ reason: 'bad_session' });
    expect(handshakes.count).toBe(2);
  });

  it('a sign-out is exempt from the cap; a token push is not', async () => {
    const { client, calls } = fakeRenewable(['bad_session', 'bad_session', 'ok']);
    const renewing = (await load())(client, () => true, 0);
    await expect(renewing.call('auth.session', push)).rejects.toMatchObject({ reason: 'bad_session' });
    await expect(renewing.call('auth.session', { signedOut: true })).resolves.toEqual({ stored: true });
    expect(calls).toHaveLength(3);
  });

  it('the cap belongs to the page: a second wrapper over the same client does not reset it', async () => {
    const { client, handshakes } = fakeRenewable(Array.from({ length: 20 }, () => 'bad_session' as const));
    const make = await load();
    for (let i = 0; i < 4; i += 1) await expect(make(client, () => true, 2).call('auth.session', push)).rejects.toMatchObject({ reason: 'bad_session' });
    expect(handshakes.count).toBe(2);
  });

  it('does nothing when the page is not in the shell', async () => {
    const { client, calls, handshakes } = fakeRenewable(['bad_session', 'ok']);
    await expect((await load())(client, () => false).call('auth.session', push)).rejects.toMatchObject({ reason: 'bad_session' });
    expect(handshakes.count).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('the renewed handshake not settling at shell gives up without a retry', async () => {
    const { client, calls } = fakeRenewable(['bad_session', 'ok'], { kind: 'web', reason: 'timeout' });
    await expect((await load())(client, () => true).call('auth.session', push)).rejects.toMatchObject({ reason: 'bad_session' });
    expect(calls).toHaveLength(1);
  });

  it('only auth.session is renewed, and only for bad_session', async () => {
    const other = fakeRenewable(['bad_session']);
    await expect((await load())(other.client, () => true).call('keepAwake', { on: true })).rejects.toMatchObject({ reason: 'bad_session' });
    const lost = fakeRenewable(['timeout']);
    await expect((await load())(lost.client, () => true).call('auth.session', push)).rejects.toMatchObject({ reason: 'timeout' });
    expect(other.handshakes.count + lost.handshakes.count).toBe(0);
  });

  it('the sign-out retry still works on top of it', async () => {
    const { client, calls } = fakeRenewable(['timeout', 'ok']);
    const { withSignOutRetry } = await import('./shellAuthSession');
    const both = withSignOutRetry((await load())(client, () => true), [1], async () => undefined);
    await expect(both.call('auth.session', { signedOut: true })).resolves.toEqual({ stored: true });
    expect(calls).toHaveLength(2);
  });
});

describe('the auth.session error path', () => {
  it('records a bad_session of the shell once, in the shell only', async () => {
    const events: Array<[string, Record<string, string>]> = [];
    const { createBridgeReporter } = await import('./shellBridgeReport');
    for (const active of [true, false]) {
      events.length = 0;
      const reporter = createBridgeReporter({ active: () => active, sink: (n, a) => void events.push([n, a]) });
      reporter.failure('auth.session', new BridgeRefusal('bad_session'));
      reporter.failure('auth.session', new BridgeRefusal('bad_session'));
      expect(events).toHaveLength(active ? 1 : 0);
    }
  });
});
