import { describe, expect, it, vi } from 'vitest';
import {
  CONFIG_TIMEOUT_MS,
  MAX_CONFIG_BYTES,
  OPEN_LAUNCH,
  REREAD_FAILED_MS,
  REREAD_OK_MS,
  createLaunchGate,
  decideLaunch,
  effectiveRouteModes,
  loadLaunchConfig,
  parseForceWebview,
  rereadDue,
  rereadOnForeground,
  rereadOnRetry,
  shownLaunch,
  storeUrlFor,
  updateCardCopy,
  type ConfigResponse,
  type FetchLike,
  type LaunchConfig,
} from './shellGate';

const ORIGIN = 'https://app.iterahq.dev';
const APPLE = 'https://apps.apple.com/br/app/itera/id1';
const PLAY = 'https://play.google.com/store/apps/details?id=dev.iterahq.player';
const STORE = { ios: APPLE, android: PLAY };

const reply = (body: string, extra: Partial<ConfigResponse> = {}): FetchLike => async () => ({ ok: true, url: `${ORIGIN}/shell-config.json`, text: async () => body, ...extra });
const json = (value: unknown) => JSON.stringify(value);
const load = (fetchImpl: FetchLike, shell = '0.2.0', timeoutMs = 50, platform = 'ios') => loadLaunchConfig(ORIGIN, shell, platform, fetchImpl, timeoutMs);

describe('decideLaunch', () => {
  it('the neutral file shipped by R-7 restricts nothing', () => {
    expect(decideLaunch('0.2.0', { minShellVersion: '0.0.0', updateUrl: null, forceWebview: [] })).toEqual({ gate: { kind: 'run' }, forceWebview: [] });
  });

  it('an older shell under a raised minimum gets the update gate, with the store URL of its own platform', () => {
    expect(decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: STORE }, 'ios')).toEqual({
      gate: { kind: 'update', shellVersion: '0.2.0', minShellVersion: '0.3.0', updateUrl: APPLE },
      forceWebview: [],
    });
    expect(decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: STORE }, 'android').gate).toMatchObject({ updateUrl: PLAY });
  });

  it('a shell at or above the minimum runs', () => {
    expect(decideLaunch('0.3.0', { minShellVersion: '0.3.0' }).gate).toEqual({ kind: 'run' });
    expect(decideLaunch('1.0.0', { minShellVersion: '0.3.0' }).gate).toEqual({ kind: 'run' });
    expect(decideLaunch('0.10.0', { minShellVersion: '0.9.0' }).gate).toEqual({ kind: 'run' });
  });

  it('a Play URL on iOS and an Apple URL on Android give no button', () => {
    expect(decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: { ios: PLAY, android: null } }, 'ios').gate).toMatchObject({ updateUrl: null });
    expect(decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: { ios: null, android: APPLE } }, 'android').gate).toMatchObject({ updateUrl: null });
    expect(decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: STORE }, 'windows').gate).toMatchObject({ updateUrl: null });
    expect(decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: STORE }).gate).toMatchObject({ updateUrl: null });
  });

  it('the old single-string updateUrl is no longer read: no button', () => {
    expect(decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: APPLE }, 'ios').gate).toMatchObject({ updateUrl: null });
  });

  it.each([
    ['ios', 'https://evil.example/app'],
    ['ios', 'http://apps.apple.com/x'],
    ['ios', 'https://apps.apple.com.evil.example/x'],
    ['ios', 'https://apps.apple.com@evil.example/x'],
    ['ios', 'https://apps.apple.com:8443/x'],
    ['ios', 'https://apps.apple.com'],
    ['ios', 'https://testflight.apple.com/join/abc'],
    ['ios', 'itms-apps://apps.apple.com/x'],
    ['ios', 'javascript:alert(1)'],
    ['ios', 'https://apps.apple.com/x y'],
    ['android', 'http://play.google.com/store/apps/details?id=a'],
    ['android', 'https://play.google.com.evil.example/store/apps/details?id=a'],
    ['android', 'https://play.google.com@evil.example/store/apps/details?id=a'],
    ['android', 'https://play.google.com/store/apps/detailsX?id=a'],
    ['android', 'https://play.google.com/store/search?q=itera'],
    ['android', 'https://market.android.com/details?id=a'],
    ['android', 'market://details?id=a'],
    ['android', 42],
  ])('%s rejects %j', (platform, url) => {
    expect(storeUrlFor(platform, { ios: url, android: url })).toBeNull();
  });

  it('accepts the exact store hosts', () => {
    expect(storeUrlFor('ios', { ios: APPLE })).toBe(APPLE);
    expect(storeUrlFor('android', { android: PLAY })).toBe(PLAY);
    expect(storeUrlFor('android', { android: 'https://play.google.com/store/apps/details' })).toBe('https://play.google.com/store/apps/details');
  });

  it('fail closed, by design: a shell whose own version is not x.y.z cannot prove it is new enough', () => {
    expect(decideLaunch('dev', { minShellVersion: '0.3.0' }).gate.kind).toBe('update');
  });

  it.each([null, 'text', 42, true, [], [{ minShellVersion: '9.0.0' }]])('a body that is not an object (%j) restricts nothing', (body) => {
    expect(decideLaunch('0.2.0', body)).toEqual(OPEN_LAUNCH);
  });

  it.each([{ minShellVersion: 3 }, { minShellVersion: '3' }, { minShellVersion: '1.2.3.4' }, { minShellVersion: '' }, {}])('a minimum of the wrong type (%j) is ignored', (body) => {
    expect(decideLaunch('0.2.0', body).gate).toEqual({ kind: 'run' });
  });

  it('a bad minimum does not drop a valid forceWebview, which only moves routes toward the WebView', () => {
    expect(decideLaunch('0.2.0', { minShellVersion: 3, forceWebview: ['/catalog'] })).toEqual({ gate: { kind: 'run' }, forceWebview: ['/catalog'] });
  });
});

describe('parseForceWebview', () => {
  it('keeps route patterns, normalises a trailing slash, drops duplicates', () => {
    expect(parseForceWebview(['/catalog', '/catalog/', '/program/:slug', '/'])).toEqual(['/catalog', '/program/:slug', '/']);
  });

  it.each([undefined, null, 'catalog', 42, {}, { 0: '/catalog' }])('%j is not a list: nothing', (value) => {
    expect(parseForceWebview(value)).toEqual([]);
  });

  it('drops entries of the wrong type, off-pattern or too long, keeps the valid ones', () => {
    expect(parseForceWebview([1, null, 'catalog', '//evil.example', 'https://evil.example/x', '/a b', '/x?y=1', '/' + 'a'.repeat(200), '/ok'])).toEqual(['/ok']);
  });

  it('keeps at most 64 entries', () => {
    expect(parseForceWebview(Array.from({ length: 200 }, (_, i) => `/r${i}`))).toHaveLength(64);
  });
});

describe('loadLaunchConfig: fail open', () => {
  const open = (what: string, fetchImpl: FetchLike) =>
    it(`${what} restricts nothing`, async () => {
      expect(await load(fetchImpl)).toEqual(OPEN_LAUNCH);
    });

  open('an HTTP error', async () => ({ ok: false, text: async () => json({ minShellVersion: '9.0.0' }) }));
  open('malformed JSON', reply('{"minShellVersion": '));
  open('an HTML page (the SPA fallback answers 200 for a missing file)', reply('<!doctype html><html></html>'));
  open('an empty body', reply(''));
  open('a network error', async () => {
    throw new TypeError('Network request failed');
  });
  open('offline (fetch rejects at once)', () => Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')));
  open('a body that cannot be read', reply('', { text: async () => Promise.reject(new Error('stream')) }));
  open('a body above the size limit', reply(json({ minShellVersion: '9.0.0', pad: 'x'.repeat(MAX_CONFIG_BYTES) })));
  open('a declared length above the limit (the body is not even read)', reply(json({ minShellVersion: '9.0.0' }), { headers: { get: () => String(MAX_CONFIG_BYTES + 1) } }));
  open('a redirect to another origin', reply(json({ minShellVersion: '9.0.0' }), { url: 'https://evil.example/shell-config.json', redirected: true }));
  open('a redirect to a look-alike host', reply(json({ minShellVersion: '9.0.0' }), { url: 'https://app.iterahq.dev.evil.example/shell-config.json' }));
  open('a redirect to plain http', reply(json({ minShellVersion: '9.0.0' }), { url: 'http://app.iterahq.dev/shell-config.json' }));

  it('a timeout restricts nothing, aborts the request and does not wait for it', async () => {
    let signal: AbortSignal | undefined;
    const started = Date.now();
    const result = await load((_url, init) => {
      signal = init.signal;
      return new Promise(() => undefined);
    }, '0.2.0', 30);
    expect(result).toEqual(OPEN_LAUNCH);
    expect(Date.now() - started).toBeLessThan(500);
    expect(signal?.aborted).toBe(true);
  });

  it('a timeout beats a late valid answer', async () => {
    const slow: FetchLike = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, text: async () => json({ minShellVersion: '9.0.0' }) }), 80));
    expect(await load(slow, '0.2.0', 20)).toEqual(OPEN_LAUNCH);
  });

  it('the default timeout is 4 s', () => {
    expect(CONFIG_TIMEOUT_MS).toBe(4000);
  });
});

describe('loadLaunchConfig: the request', () => {
  it('asks the app origin for /shell-config.json with no-store, and nothing else', async () => {
    const fetchImpl = vi.fn(reply(json({ minShellVersion: '0.0.0' })));
    await load(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://app.iterahq.dev/shell-config.json');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it('a URL named inside the config is never fetched', async () => {
    const fetchImpl = vi.fn(reply(json({ minShellVersion: '0.0.0', configUrl: 'https://evil.example/c.json', updateUrl: 'https://evil.example/u', forceWebview: ['https://evil.example/'] })));
    await load(fetchImpl);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['https://app.iterahq.dev/shell-config.json']);
  });

  it('a valid answer on the app origin is decided', async () => {
    expect(await load(reply(json({ minShellVersion: '0.3.0', updateUrl: STORE, forceWebview: ['/catalog'] })))).toEqual({
      gate: { kind: 'update', shellVersion: '0.2.0', minShellVersion: '0.3.0', updateUrl: APPLE },
      forceWebview: ['/catalog'],
    });
  });
});

describe('createLaunchGate: once per launch', () => {
  it('reads the file once however many times it is asked, and peek() is null until it settles', async () => {
    const fetchImpl = vi.fn(reply(json({ minShellVersion: '0.3.0' })));
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', fetchImpl, 50);
    expect(gate.peek()).toBeNull();
    const [a, b] = await Promise.all([gate.get(), gate.get()]);
    expect(a).toBe(b);
    expect(await gate.get()).toBe(a);
    expect(gate.peek()).toBe(a);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('effectiveRouteModes: the remote config only downgrades', () => {
  const bundled = [
    { path: '/catalog', mode: 'webview' as const },
    { path: '/program/:slug', mode: 'native' as const },
    { path: '/lesson/:lessonId', mode: 'native' as const },
  ];

  it('a config that names a route native, that the bundled map has as webview, is ignored', () => {
    const body = { minShellVersion: '0.0.0', forceWebview: [], routes: { '/catalog': 'native' }, native: ['/catalog'], forceNative: ['/catalog'], modes: { '/catalog': 'native' } };
    const { forceWebview } = decideLaunch('0.2.0', body);
    expect(forceWebview).toEqual([]);
    expect(effectiveRouteModes(bundled, forceWebview).get('/catalog')).toBe('webview');
  });

  it('naming a webview route in forceWebview changes nothing', () => {
    expect(effectiveRouteModes(bundled, ['/catalog']).get('/catalog')).toBe('webview');
  });

  it('forceWebview sends a bundled native route back to the WebView, and only that one', () => {
    const modes = effectiveRouteModes(bundled, ['/program/:slug']);
    expect(modes.get('/program/:slug')).toBe('webview');
    expect(modes.get('/lesson/:lessonId')).toBe('native');
  });

  it('a name that is not in the bundled map adds no route', () => {
    const modes = effectiveRouteModes(bundled, ['/not-a-route']);
    expect([...modes.keys()]).toEqual(['/catalog', '/program/:slug', '/lesson/:lessonId']);
  });

  it('no config, no change', () => {
    expect([...effectiveRouteModes(bundled, []).values()]).toEqual(['webview', 'native', 'native']);
  });
});

describe('createLaunchGate: refresh', () => {
  const answers = (...bodies: (string | null)[]): FetchLike => {
    let i = 0;
    return async () => {
      const body = bodies[Math.min(i++, bodies.length - 1)];
      if (body === null) throw new Error('offline');
      return { ok: true, url: `${ORIGIN}/shell-config.json`, text: async () => body };
    };
  };
  const OLD = json({ minShellVersion: '0.3.0' });
  const NEUTRAL = json({ minShellVersion: '0.0.0', updateUrl: null, forceWebview: [] });

  it('the WebView is not held back: peek() is null while the first read is pending', () => {
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', () => new Promise(() => undefined), 20);
    void gate.get();
    expect(gate.peek()).toBeNull();
  });

  it('a later neutral config lifts the card', async () => {
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', answers(OLD, NEUTRAL), 50);
    expect((await gate.get()).gate.kind).toBe('update');
    expect((await gate.refresh()).gate.kind).toBe('run');
    expect(gate.peek()?.gate.kind).toBe('run');
  });

  it('a later config that cannot be read keeps the card', async () => {
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', answers(OLD, null, '<html>'), 50);
    await gate.get();
    expect((await gate.refresh()).gate.kind).toBe('update');
    expect((await gate.refresh()).gate.kind).toBe('update');
  });

  it('a raised minimum after a neutral read puts the card up on the next refresh', async () => {
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', answers(NEUTRAL, OLD), 50);
    await gate.get();
    expect((await gate.refresh()).gate.kind).toBe('update');
  });

  it('refreshes that overlap share one request', async () => {
    const fetchImpl = vi.fn(answers(OLD, NEUTRAL));
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', fetchImpl, 50);
    await gate.get();
    await Promise.all([gate.refresh(), gate.refresh()]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('createLaunchGate: failed reads are read again, and a late read never overwrites a newer one', () => {
  const OLD = json({ minShellVersion: '0.3.0' });
  const NEUTRAL = json({ minShellVersion: '0.0.0', updateUrl: null, forceWebview: [] });
  const deferred = () => {
    let resolve!: (r: ConfigResponse) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<ConfigResponse>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject, ok: (body: string) => resolve({ ok: true, url: `${ORIGIN}/shell-config.json`, text: async () => body }) };
  };

  it('status is null until the first read ends, ok after a read, and not ok after a failed one (offline at launch)', async () => {
    let t = 1000;
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', async () => Promise.reject(new Error('offline')), 50, () => t);
    void gate.get();
    expect(gate.status()).toBeNull();
    await gate.get();
    expect(gate.status()).toEqual({ ok: false, at: 1000 });
    expect(gate.peek()).toBe(OPEN_LAUNCH);
    t = 2000;
    await gate.refresh();
    expect(gate.status()).toEqual({ ok: false, at: 2000 });
  });

  it('an offline launch is corrected by a later read: the minimum then closes the app', async () => {
    let online = false;
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', async () => (online ? { ok: true, url: `${ORIGIN}/shell-config.json`, text: async () => OLD } : Promise.reject(new Error('offline'))), 50);
    expect((await gate.get()).gate.kind).toBe('run');
    expect(gate.status()?.ok).toBe(false);
    online = true;
    expect((await gate.refresh()).gate.kind).toBe('update');
    expect(gate.status()?.ok).toBe(true);
  });

  it('a get() that settles after a later refresh() does not overwrite the newer decision', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', () => queue.shift()!.promise, 5000);
    const got = gate.get();
    const refreshed = gate.refresh();
    second.ok(NEUTRAL);
    expect((await refreshed).gate.kind).toBe('run');
    first.ok(OLD);
    const late = await got;
    expect(late.gate.kind).toBe('run');
    expect(gate.peek()?.gate.kind).toBe('run');
  });

  it('a get() that fails after a later refresh() that succeeded changes nothing', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', () => queue.shift()!.promise, 5000);
    const got = gate.get();
    const refreshed = gate.refresh();
    second.ok(OLD);
    await refreshed;
    first.reject(new Error('offline'));
    expect((await got).gate.kind).toBe('update');
    expect(gate.status()?.ok).toBe(true);
  });

  it('a successful read that was slow still counts when a newer read failed', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const gate = createLaunchGate(ORIGIN, '0.2.0', 'ios', () => queue.shift()!.promise, 5000);
    const got = gate.get();
    const refreshed = gate.refresh();
    second.reject(new Error('offline'));
    await refreshed;
    first.ok(OLD);
    expect((await got).gate.kind).toBe('update');
  });
});

describe('rereadDue and rereadOnRetry', () => {
  const at = 1_000_000;
  it('while the first read is pending nothing is read again', () => {
    expect(rereadDue('run', null, at)).toBe(false);
  });
  it('after a failed read, the foreground reads again once REREAD_FAILED_MS has passed', () => {
    expect(rereadDue('run', { ok: false, at }, at + REREAD_FAILED_MS - 1)).toBe(false);
    expect(rereadDue('run', { ok: false, at }, at + REREAD_FAILED_MS)).toBe(true);
  });
  it('after a successful read, not on every foreground: once REREAD_OK_MS has passed', () => {
    expect(rereadDue('run', { ok: true, at }, at + 60_000)).toBe(false);
    expect(rereadDue('run', { ok: true, at }, at + REREAD_OK_MS - 1)).toBe(false);
    expect(rereadDue('run', { ok: true, at }, at + REREAD_OK_MS)).toBe(true);
  });
  it('the update card reads on every foreground', () => {
    expect(rereadDue('update', { ok: true, at }, at + 1)).toBe(true);
  });
  it('the retry of the failure card reads again only when the last read failed', () => {
    expect(rereadOnRetry(null)).toBe(false);
    expect(rereadOnRetry({ ok: true, at })).toBe(false);
    expect(rereadOnRetry({ ok: false, at })).toBe(true);
  });
});

describe('rereadOnForeground: the listener of the route', () => {
  const at = 1_000_000;
  const UPDATE: LaunchConfig = { gate: { kind: 'update', shellVersion: '0.2.0', minShellVersion: '0.3.0', updateUrl: APPLE }, forceWebview: [] };
  it.each(['background', 'inactive', 'unknown', ''])('the state "%s" never reads', (state) => {
    expect(rereadOnForeground(state, UPDATE, { ok: true, at }, at + REREAD_OK_MS)).toBe(false);
    expect(rereadOnForeground(state, OPEN_LAUNCH, { ok: false, at }, at + REREAD_FAILED_MS)).toBe(false);
  });
  it('active with the update card in memory always reads', () => {
    expect(rereadOnForeground('active', UPDATE, { ok: true, at }, at + 1)).toBe(true);
  });
  it('active with a run launch reads by the age of the last read', () => {
    expect(rereadOnForeground('active', OPEN_LAUNCH, { ok: true, at }, at + REREAD_OK_MS - 1)).toBe(false);
    expect(rereadOnForeground('active', OPEN_LAUNCH, { ok: true, at }, at + REREAD_OK_MS)).toBe(true);
    expect(rereadOnForeground('active', OPEN_LAUNCH, { ok: false, at }, at + REREAD_FAILED_MS)).toBe(true);
  });
  it('active before the first read answered (no launch, no status) reads nothing', () => {
    expect(rereadOnForeground('active', null, null, at)).toBe(false);
  });
});

describe('shownLaunch: the update card never tears down a mounted page', () => {
  const RUN = decideLaunch('0.2.0', { minShellVersion: '0.0.0' });
  const UPDATE = decideLaunch('0.2.0', { minShellVersion: '0.3.0' });
  const same = { entryChanged: false, pageGone: false };

  it('the first read applies at once (launch: no learner state yet)', () => {
    expect(shownLaunch(null, UPDATE, same)).toBe(UPDATE);
    expect(shownLaunch(null, RUN, same)).toBe(RUN);
  });
  it('a run -> update flip under a mounted page is held back', () => {
    expect(shownLaunch(RUN, UPDATE, same)).toBe(RUN);
  });
  it('and applies at the next route entry', () => {
    expect(shownLaunch(RUN, UPDATE, { entryChanged: true, pageGone: false })).toBe(UPDATE);
  });
  it('and at once when the page is already gone (the retry of the failure card)', () => {
    expect(shownLaunch(RUN, UPDATE, { entryChanged: false, pageGone: true })).toBe(UPDATE);
  });
  it('a card that is up follows the fresh read, both ways', () => {
    expect(shownLaunch(UPDATE, RUN, same)).toBe(RUN);
    expect(shownLaunch(UPDATE, UPDATE, same)).toBe(UPDATE);
  });
  it('run -> run follows the fresh read, and no read keeps what is shown', () => {
    expect(shownLaunch(RUN, OPEN_LAUNCH, same)).toBe(OPEN_LAUNCH);
    expect(shownLaunch(RUN, null, same)).toBe(RUN);
  });
});

describe('updateCardCopy', () => {
  const gate = (updateUrl: string | null) => ({ kind: 'update' as const, shellVersion: '0.2.0', minShellVersion: '0.3.0', updateUrl });

  it('without a store URL the card is complete without a button, and does not name a store', () => {
    const copy = updateCardCopy(gate(null));
    expect(copy.button).toBeNull();
    expect(copy.url).toBeNull();
    expect(copy.body).toContain('0.2.0');
    expect(copy.body).toContain('0.3.0');
    expect(copy.detail).toBe('Uma atualização é necessária. Fale com quem te passou o app.');
    expect(`${copy.body} ${copy.detail}`).not.toMatch(/loja|store/i);
    expect(copy.retry).toBe('Tentar de novo');
  });

  it('with a vetted store URL the button opens exactly that URL', () => {
    expect(updateCardCopy(gate(APPLE))).toMatchObject({ button: 'Atualizar agora', url: APPLE, detail: null });
  });

  it('end to end: a config with a foreign store host gives a card with no button', () => {
    const { gate: g } = decideLaunch('0.2.0', { minShellVersion: '0.3.0', updateUrl: { ios: 'https://evil.example/' } }, 'ios');
    expect(g.kind === 'update' && updateCardCopy(g).button).toBeNull();
  });
});
