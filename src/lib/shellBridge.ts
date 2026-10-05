import { useEffect } from 'react';
import { createBridgeClient, type BridgeClient, type BridgeMode, type BridgeTransport } from '@iterahq/shell-bridge';
import { domTransport } from '@iterahq/shell-bridge/web';
import { setUmamiProperty } from './analytics';
import { helloIdOf, isNativeReply } from './shellReply';

const SHELL_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

/** A cold start can drop the first `hello`: it is sent once more, same id, if nothing came back by then. */
export const HELLO_RESEND_MS = 600;

let client: BridgeClient | null = null;
let nativeReplied = false;
const replyListeners = new Set<() => void>();

/**
 * True once the native side REPLIED to a `hello` of this page, by the rule of `isNativeReply`: a
 * parsed bridge envelope of kind `result` or `refusal` that carries the id of our `hello` (a
 * `HelloAck`, a malformed ack, a refusal, a reply of another protocol version), delivered by this
 * window on this origin. Such a reply proves a shell is there, whatever the handshake then settles
 * at. An echo of our own `hello`, or a string that only contains the tag, proves nothing. A browser
 * tab has no channel, so this never turns true there.
 */
export function nativeSideReplied(): boolean {
  return nativeReplied;
}

/** Runs `fn` once, at the first reply of the native side. Returns the unsubscribe function. */
export function onNativeReply(fn: () => void): () => void {
  replyListeners.add(fn);
  return () => {
    replyListeners.delete(fn);
  };
}

function noteNativeReply(): void {
  if (nativeReplied) return;
  nativeReplied = true;
  const listeners = [...replyListeners];
  replyListeners.clear();
  for (const fn of listeners) fn();
}

/**
 * The transport of the client, observed: it remembers the id of each `hello` the page sends, notes
 * the first reply to one of them, and repeats the first `hello` once. The repeat carries the same
 * id, so a shell that already took the first one answers `replayed_id` and opens no second session.
 */
function observed(transport: BridgeTransport, origin: string, stillPending: () => boolean): BridgeTransport {
  const helloIds = new Set<string>();
  let helloSent = false;
  return {
    self: transport.self,
    send(raw) {
      const helloId = nativeReplied ? null : helloIdOf(raw);
      if (helloId !== null) helloIds.add(helloId);
      transport.send(raw);
      if (helloSent || helloId === null) return;
      helloSent = true;
      setTimeout(() => {
        if (nativeReplied || !stillPending()) return;
        try {
          transport.send(raw);
        } catch {
          // the channel went away: the handshake times out as before
        }
      }, HELLO_RESEND_MS);
    },
    listen(handler) {
      return transport.listen((m) => {
        if (!nativeReplied && m.source === transport.self && m.origin === origin && isNativeReply(m.data, helloIds)) noteNativeReply();
        handler(m);
      });
    },
  };
}

/**
 * The bridge handshake is the only shell detection (PLAN ADR-4, ADR-9): no user-agent test and no
 * `?ui=` switch. In a browser tab `domTransport()` is null, so nothing is listened to, posted or
 * logged and the mode settles at `no_shell`. Inside the shell, once the shell answers `HelloAck`,
 * the Umami session property `shell=<version>` is set. Never throws.
 */
export function startShellBridge(win: Window = window): BridgeClient | null {
  if (client) return client;
  try {
    const channel = domTransport(win);
    const transport = channel ? observed(channel, win.location.origin, () => client?.mode().kind === 'pending') : null;
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
