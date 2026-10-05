import type { BridgeTransport } from './client';

interface ShellChannel {
  postMessage(data: string): void;
}

/** The shell channel of this window, or null in a browser tab. */
export function domTransport(win: Window & { ReactNativeWebView?: ShellChannel } = window): BridgeTransport | null {
  const channel = win.ReactNativeWebView;
  if (!channel || typeof channel.postMessage !== 'function') return null;
  return {
    send: (raw) => channel.postMessage(raw),
    listen(handler) {
      const fn = (ev: MessageEvent) => handler({ data: ev.data, origin: ev.origin, source: ev.source });
      win.addEventListener('message', fn);
      return () => win.removeEventListener('message', fn);
    },
    self: win,
  };
}

export * from './index';
