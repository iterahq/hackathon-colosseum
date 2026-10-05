// @vitest-environment-options { "url": "https://app.iterahq.test/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createShellRouter } from '@iterahq/shell-bridge';

type ShellWindow = Window & { ReactNativeWebView?: { postMessage(raw: string): void } };

function installShell() {
  const origin = window.location.origin;
  const router = createShellRouter({ origin, shellVersion: '0.3.0', handlers: { 'shell.version': () => ({ shellVersion: '0.3.0', protocol: 1 }) } });
  (window as ShellWindow).ReactNativeWebView = {
    postMessage(raw: string) {
      void router.receive(raw, `${origin}/`).then((out) => {
        if (out.reply) window.dispatchEvent(new MessageEvent('message', { data: out.reply, origin, source: window }));
      });
    },
  };
}

describe('useShellSurface', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    delete (window as ShellWindow).ReactNativeWebView;
  });

  async function probe() {
    const { useShellSurface } = await import('./useShellSurface');
    const seen: string[] = [];
    function Probe() {
      const surface = useShellSurface();
      seen.push(surface);
      return <span data-testid="surface">{surface}</span>;
    }
    return { Probe, seen };
  }

  it('in a browser tab: `web` on the first render and no second render', async () => {
    const { Probe, seen } = await probe();
    render(<Probe />);
    expect(screen.getByTestId('surface')).toHaveTextContent('web');
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(seen).toEqual(['web']);
  });

  it('inside the shell: `pending` first, `shell` after HelloAck', async () => {
    installShell();
    const { Probe, seen } = await probe();
    render(<Probe />);
    expect(screen.getByTestId('surface')).toHaveTextContent('pending');
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.getByTestId('surface')).toHaveTextContent('shell');
    expect(seen).toEqual(['pending', 'shell']);
  });
});
