import { useEffect } from 'react';
import {
  createBridgeClient,
  type AskHandler,
  type AskMethod,
  type BridgeClient,
  type BridgeMode,
  type BridgeTransport,
} from '@iterahq/shell-bridge';
import { domTransport } from '@iterahq/shell-bridge/web';
import { setUmamiProperty } from './analytics';
import { callIdOf, helloIdOf, isNativeReply } from './shellReply';
import { BridgeSuperseded, createBridgeReporter } from './shellBridgeReport';

const SHELL_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

/** A cold start can drop the first `hello`: it is sent once more, same id, if nothing came back by then. */
export const HELLO_RESEND_MS = 600;

/** The page's bridge client plus the one operation the client itself lacks: a second handshake. */
export interface RenewableBridgeClient extends BridgeClient {
  /** Counts the handshakes this page has started over: a caller compares it before and after a failed call. */
  generation(): number;
  /** Replaces the client by a fresh one, handshakes it and re-registers the asks. See `renewable`. */
  renew(): Promise<BridgeMode>;
  /** Runs `fn` after each renewal whose new handshake settled at `shell`. Returns the unsubscribe function. */
  onRenewed(fn: () => void): () => void;
}

let client: RenewableBridgeClient | null = null;
let nativeReplied = false;
const replyListeners = new Set<() => void>();
/** Ids of the `hello`s this page sent: the shell answers the 600 ms resend with `replayed_id` carrying one. */
const ownHelloIds = new Set<string>();
/** Ids of calls sent by a client that `renew()` has since replaced: their late replies find no pending call. */
const abandonedCallIds = new Set<string>();
let currentCallIds = new Set<string>();

/** The page's own traffic coming back is not a fault of the shell: a resent hello, a call a renewal gave up on. */
function isOwnEcho(reason: string, detail: string | undefined): boolean {
  if (detail === undefined || (reason !== 'replayed_id' && reason !== 'unknown_id')) return false;
  return ownHelloIds.has(detail) || abandonedCallIds.has(detail);
}

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

/**
 * True when this page is inside the shell: the native side replied to our `hello`, or the handshake
 * settled at `shell`. A browser tab, or a page the shell has not answered yet, is not.
 */
export function inShell(): boolean {
  return nativeReplied || client?.mode().kind === 'shell';
}

/** The one reporter of the page: records a refusal once per (method, reason), and only inside the shell. */
export const bridgeReport = createBridgeReporter({ active: inShell });

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
  const helloIds = ownHelloIds;
  let helloSent = false;
  return {
    self: transport.self,
    send(raw) {
      const helloId = nativeReplied ? null : helloIdOf(raw);
      if (helloId !== null) helloIds.add(helloId);
      else {
        const callId = callIdOf(raw);
        if (callId !== null) currentCallIds.add(callId);
      }
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
export function startShellBridge(win: Window = window): RenewableBridgeClient | null {
  if (client) return client;
  try {
    const channel = domTransport(win);
    const make = (): BridgeClient =>
      createBridgeClient({
        transport: channel ? observed(channel, win.location.origin, () => client?.mode().kind === 'pending') : null,
        origin: win.location.origin,
        webVersion: import.meta.env.VITE_BUILD_SHA || 'dev',
        onRefusal: (reason, detail) => {
          if (!isOwnEcho(reason, detail)) bridgeReport.refusal('incoming', reason, detail);
        },
      });
    const created = renewable(make);
    client = created;
    void created.handshake().then(onSettled, () => undefined);
    return created;
  } catch {
    return null;
  }
}

/**
 * A client that can start its handshake over. `createBridgeClient` caches its handshake for good and
 * only resets it when the shell answers `no_handshake`; a shell that swapped the session under a live
 * page (another frame handshook, a router rebuilt) answers `bad_session` and the client stays stuck.
 * Renewing makes a new client on the same channel and disposes the old one. What that means for calls
 * in flight: `dispose` rejects each of them with `no_handshake` at once, which is right, because the
 * shell refuses them as `bad_session` anyway. That rejection is local, not the shell's: it reaches the
 * caller as `BridgeSuperseded`, which the reporter skips, and the late reply of such a call is skipped
 * too (`abandonedCallIds`). The asks registered through `onAsk` are moved to the new client; the old
 * client stops listening. Any accepted hello makes the shell release the wake lock, so `onRenewed`
 * lets the keep-awake holder ask again.
 */
function renewable(make: () => BridgeClient): RenewableBridgeClient {
  let inner = make();
  let generation = 0;
  const renewed = new Set<() => void>();
  const asks = new Map<symbol, { method: AskMethod; handler: AskHandler<AskMethod>; off: () => void }>();
  return {
    handshake: () => inner.handshake(),
    mode: () => inner.mode(),
    has: (method) => inner.has(method),
    async call(method, payload) {
      const sentIn = generation;
      try {
        return await inner.call(method, payload);
      } catch (error) {
        if (sentIn !== generation && (error as { reason?: unknown } | null)?.reason === 'no_handshake') throw new BridgeSuperseded();
        throw error;
      }
    },
    onAsk(method, handler) {
      const id = Symbol(method);
      asks.set(id, { method, handler: handler as AskHandler<AskMethod>, off: inner.onAsk(method, handler) });
      return () => {
        asks.get(id)?.off();
        asks.delete(id);
      };
    },
    dispose: () => inner.dispose(),
    generation: () => generation,
    renew() {
      const old = inner;
      generation += 1;
      inner = make();
      for (const id of currentCallIds) abandonedCallIds.add(id);
      currentCallIds = new Set();
      old.dispose();
      for (const ask of asks.values()) ask.off = inner.onAsk(ask.method, ask.handler);
      const settled = inner.handshake();
      void settled.then((mode) => {
        if (mode.kind === 'shell') for (const fn of [...renewed]) fn();
      });
      return settled;
    },
    onRenewed(fn) {
      renewed.add(fn);
      return () => void renewed.delete(fn);
    },
  };
}

function onSettled(mode: BridgeMode): void {
  // The shell answered our hello with a refusal or a bad ack: the reason is the shell's, not a missing shell.
  if (mode.kind === 'web') bridgeReport.refusal('hello', mode.reason, mode.detail);
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
