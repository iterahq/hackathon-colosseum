import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { createShellRouter } from '@iterahq/shell-bridge';

const ORIGIN = 'https://app.iterahq.dev';

type Listener = (ev: { data: unknown; origin: string; source: unknown }) => void;

/** A window of the shell: `ReactNativeWebView` answers through a real shell router, as the host does. */
function shellWindow(shellVersion: string) {
  const router = createShellRouter({ origin: ORIGIN, shellVersion, handlers: { 'shell.version': () => ({ shellVersion, protocol: 1 }) } });
  const listeners = new Set<Listener>();
  const win = {
    location: { origin: ORIGIN },
    ReactNativeWebView: {
      postMessage(raw: string) {
        void router.receive(raw, `${ORIGIN}/lesson/1`).then((out) => {
          if (out.reply) for (const l of listeners) l({ data: out.reply, origin: ORIGIN, source: win });
        });
      },
    },
    addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
  };
  return win as unknown as Window;
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe('startShellBridge in a browser tab (no_shell)', () => {
  let load: () => Promise<typeof import('./shellBridge')>;
  beforeEach(() => {
    vi.resetModules();
    load = () => import('./shellBridge');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { umami?: unknown }).umami;
  });

  it('settles at no_shell and does nothing observable', async () => {
    const identify = vi.fn();
    (window as Window & { umami?: unknown }).umami = { identify };
    const add = vi.spyOn(window, 'addEventListener');
    const post = vi.spyOn(window, 'postMessage');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const before = document.documentElement.outerHTML;

    const { startShellBridge } = await load();
    const client = startShellBridge();
    expect(await client?.handshake()).toMatchObject({ kind: 'web', reason: 'no_shell' });
    await settle();

    expect(add).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(identify).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).toBe(before);
    vi.unstubAllGlobals();
  });

  it('is not a user-agent test: a mobile user agent alone changes nothing', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148');
    const { startShellBridge } = await load();
    expect(await startShellBridge()?.handshake()).toMatchObject({ kind: 'web', reason: 'no_shell' });
  });

  it('starts once', async () => {
    const { startShellBridge } = await load();
    expect(startShellBridge()).toBe(startShellBridge());
  });
});

describe('startShellBridge inside the shell', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => delete (window as Window & { umami?: unknown }).umami);

  it('sets the Umami property shell=<version> after HelloAck', async () => {
    const identify = vi.fn();
    (window as Window & { umami?: unknown }).umami = { identify };
    const { startShellBridge } = await import('./shellBridge');
    const client = startShellBridge(shellWindow('0.2.0'));
    const mode = await client?.handshake();
    await settle();
    expect(mode).toMatchObject({ kind: 'shell', shellVersion: '0.2.0', capabilities: ['shell.version'] });
    expect(identify).toHaveBeenCalledExactlyOnceWith({ shell: '0.2.0' });
    expect(await client?.call('shell.version', {})).toEqual({ shellVersion: '0.2.0', protocol: 1 });
  });

  it('ignores a shell version that is not x.y.z', async () => {
    const identify = vi.fn();
    (window as Window & { umami?: unknown }).umami = { identify };
    const { startShellBridge } = await import('./shellBridge');
    await startShellBridge(shellWindow('0.2.0; drop'))?.handshake();
    await settle();
    expect(identify).not.toHaveBeenCalled();
  });
});

describe('ShellBridgeMount', () => {
  beforeEach(() => vi.resetModules());

  it('importing the module starts nothing; mounting starts the handshake once', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const mod = await import('./shellBridge');
    expect(add).not.toHaveBeenCalled();
    const { unmount } = render(createElement(mod.ShellBridgeMount));
    const client = mod.startShellBridge();
    expect(await client?.handshake()).toMatchObject({ kind: 'web', reason: 'no_shell' });
    unmount();
    add.mockRestore();
  });
});
