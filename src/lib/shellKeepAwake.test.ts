import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { createShellRouter, type Method } from '@iterahq/shell-bridge';

const ORIGIN = 'https://app.iterahq.dev';

type Listener = (ev: { data: unknown; origin: string; source: unknown }) => void;

/** A window of the shell: `ReactNativeWebView` answers through a real shell router that records `keepAwake`. */
function shellWindow(capabilities: Method[], delayMs = 0) {
  const calls: boolean[] = [];
  const handlers: Record<string, (p: unknown) => unknown> = { 'shell.version': () => ({ shellVersion: '0.2.0', protocol: 1 }) };
  if (capabilities.includes('keepAwake')) handlers.keepAwake = (p) => (calls.push((p as { on: boolean }).on), { on: (p as { on: boolean }).on });
  const router = createShellRouter({ origin: ORIGIN, shellVersion: '0.2.0', handlers });
  const listeners = new Set<Listener>();
  const posted: string[] = [];
  const win = {
    location: { origin: ORIGIN },
    ReactNativeWebView: {
      postMessage(raw: string) {
        posted.push(raw);
        void router.receive(raw, `${ORIGIN}/lesson/1`).then((out) => {
          if (out.reply) setTimeout(() => { for (const l of listeners) l({ data: out.reply, origin: ORIGIN, source: win }); }, delayMs);
        });
      },
    },
    addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
  };
  return { win: win as unknown as Window, calls, posted };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

let go: (to: string) => void = () => undefined;
function Nav() {
  const navigate = useNavigate();
  go = (to) => navigate(to);
  return null;
}

describe('wantsKeepAwake', () => {
  it.each([
    ['/lesson/abc', true],
    ['/lesson/abc/', true],
    ['/live/9f2', true],
    ['/live/instructor', true],
    ['/live', true],
    ['/', false],
    ['/lesson', false],
    ['/lesson/abc/extra', false],
    ['/lessons/abc', false],
    ['/livestream', false],
    ['/catalog', false],
    ['/admin/live', false],
  ])('%s -> %s', async (pathname, expected) => {
    const { wantsKeepAwake } = await import('./shellKeepAwake');
    expect(wantsKeepAwake(pathname)).toBe(expected);
  });
});

describe('KeepAwakeRouteMount', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  const mount = async (initial: string, win: Window | null) => {
    const bridge = await import('./shellBridge');
    if (win) bridge.startShellBridge(win);
    const { KeepAwakeRouteMount } = await import('./shellKeepAwake');
    return render(createElement(MemoryRouter, { initialEntries: [initial], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Nav), createElement(KeepAwakeRouteMount)));
  };

  it('in a browser tab it sends nothing, listens to nothing and logs nothing, on a lesson route too', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const post = vi.spyOn(window, 'postMessage');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const view = await mount('/lesson/1', null);
    await settle();
    act(() => go('/live/abc'));
    await settle();
    view.unmount();
    expect(add).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(view.container.innerHTML).toBe('');
    vi.unstubAllGlobals();
  });

  it('holds on entering a lesson, keeps holding across lesson and live, releases on leaving', async () => {
    const shell = shellWindow(['keepAwake', 'shell.version']);
    await mount('/', shell.win);
    await settle();
    expect(shell.calls).toEqual([]);
    act(() => go('/lesson/1'));
    await settle();
    expect(shell.calls).toEqual([true]);
    act(() => go('/lesson/2'));
    act(() => go('/live/abc'));
    await settle();
    expect(shell.calls).toEqual([true]);
    act(() => go('/catalog'));
    await settle();
    expect(shell.calls).toEqual([true, false]);
  });

  it('releases on unmount while a lesson is open', async () => {
    const shell = shellWindow(['keepAwake', 'shell.version']);
    const view = await mount('/lesson/1', shell.win);
    await settle();
    expect(shell.calls).toEqual([true]);
    view.unmount();
    await settle();
    expect(shell.calls).toEqual([true, false]);
  });

  it('a route left before the handshake settles never asks', async () => {
    const shell = shellWindow(['keepAwake', 'shell.version'], 40);
    await mount('/lesson/1', shell.win);
    act(() => go('/'));
    await new Promise((r) => setTimeout(r, 120));
    expect(shell.calls).toEqual([]);
  });

  it('a shell that does not offer keepAwake (0.1.0) is never asked', async () => {
    const shell = shellWindow(['shell.version']);
    await mount('/lesson/1', shell.win);
    await settle();
    act(() => go('/'));
    await settle();
    expect(shell.calls).toEqual([]);
    expect(shell.posted.filter((raw) => raw.includes('keepAwake'))).toEqual([]);
  });
});
