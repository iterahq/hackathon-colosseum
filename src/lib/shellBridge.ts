import { useEffect } from 'react';
import { createBridgeClient, type BridgeClient, type BridgeMode } from '@iterahq/shell-bridge';
import { domTransport } from '@iterahq/shell-bridge/web';
import { setUmamiProperty } from './analytics';

const SHELL_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

let client: BridgeClient | null = null;

/**
 * The bridge handshake is the only shell detection (PLAN ADR-4, ADR-9): no user-agent test and no
 * `?ui=` switch. In a browser tab `domTransport()` is null, so nothing is listened to, posted or
 * logged and the mode settles at `no_shell`. Inside the shell, once the shell answers `HelloAck`,
 * the Umami session property `shell=<version>` is set. Never throws.
 */
export function startShellBridge(win: Window = window): BridgeClient | null {
  if (client) return client;
  try {
    const transport = domTransport(win);
    const created = createBridgeClient({
      transport,
      origin: win.location.origin,
      webVersion: import.meta.env.VITE_BUILD_SHA || 'dev',
    });
    client = created;
    void created.handshake().then(onSettled, () => undefined);
    return created;
  } catch {
    return null;
  }
}

function onSettled(mode: BridgeMode): void {
  if (mode.kind !== 'shell' || !SHELL_VERSION.test(mode.shellVersion)) return;
  try {
    setUmamiProperty('shell', mode.shellVersion);
  } catch {
    // analytics must never break the page
  }
}

/** Mounted once under the router: the handshake starts after mount, never as an import side effect. */
export function ShellBridgeMount(): null {
  useEffect(() => {
    startShellBridge();
  }, []);
  return null;
}
