/**
 * The bridge side of the shell (PLAN ADR-9): the parser of a bridge message and the one router that
 * answers it. It sits beside `consoleMessage.ts`; `parseConsoleMessage` stays the only reader of the
 * console forwarder's messages, `parseBridgeMessage` the only reader of bridge messages. Neither
 * touches the other's shape, and `app/[...path].tsx` calls them in that order.
 *
 * Capabilities: `shell.version` and `keepAwake` (R-8, held by `keepAwakeHolder.ts`). No token, no
 * navigation command, no file access: a method of the protocol without a handler here answers
 * `capability_absent`. The payload of `keepAwake` is validated by the router (`{on: boolean}`, no other
 * field) before the handler runs.
 *
 * Pure TypeScript: no React Native import.
 */
import type { KeepAwakeClaims } from './keepAwakeHolder';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, createShellRouter, deliveryScript, originOf, parseEnvelope, type RefusalReason } from '@iterahq/shell-bridge';

/** A message that passed the native gate. The router still checks id, session, method and payload. */
export interface BridgeMessage {
  raw: string;
  senderUrl: string;
  kind: 'hello' | 'call' | 'other';
}

/**
 * `event` is the `nativeEvent` of the WebView message. The sender is the frame URL the WebView reports:
 * a frame on any other origin (an iframe of a third party, a page navigated away) is dropped here, with
 * no reply. A same-origin sub-frame cannot be told from the top frame by this URL; it can only speak to
 * the router, which holds one handshake session per page load, and every reply goes to the top frame.
 * What is dropped silently: a non-string, a message above the size cap, and anything that is not a bridge
 * envelope at all (the forwarder's messages included). A bridge envelope with a bad version or id passes,
 * so the router answers it with a named refusal.
 */
export function parseBridgeMessage(event: { data: unknown; url: unknown }, origin: string): BridgeMessage | null {
  const appOrigin = originOf(origin);
  if (appOrigin === null || typeof event.url !== 'string' || originOf(event.url) !== appOrigin) return null;
  if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE_BYTES) return null;
  const parsed = parseEnvelope(event.data);
  if (parsed.ok === false) {
    return parsed.reason === 'version_mismatch' || parsed.reason === 'bad_id' ? { raw: event.data, senderUrl: event.url, kind: 'other' } : null;
  }
  const kind = parsed.envelope.kind;
  return { raw: event.data, senderUrl: event.url, kind: kind === 'hello' || kind === 'call' ? kind : 'other' };
}

export interface ShellBridgeOptions {
  /** The ONE configured web origin (`expo.extra.webOrigin`). */
  origin: string;
  /** The version of this shell binary, `x.y.z` (`expo.version`). */
  shellVersion: string;
  /** The process-wide registry behind `keepAwake` (one per process, shared by every mounted WebView). */
  keepAwake: KeepAwakeClaims;
}

export interface ShellBridgeOutcome {
  /** The script that delivers the reply to the page (posts to the app origin only), or null for no reply. */
  script: string | null;
  /** True when the message was a hello that the router accepted. */
  handshake: boolean;
  refused: RefusalReason | null;
}

export interface ShellBridge {
  readonly capabilities: readonly string[];
  handle(message: BridgeMessage): Promise<ShellBridgeOutcome>;
  /** Forget the handshake and release the screen lock. Called on each top-frame load start, on relaunch and on unmount. */
  reset(): void;
  /** True while the page holds the screen awake. */
  keepAwakeHeld(): boolean;
}

let nextOwner = 0;

export function createShellBridge({ origin, shellVersion, keepAwake }: ShellBridgeOptions): ShellBridge {
  const holder = keepAwake.owner(`webview-${(nextOwner += 1)}`);
  const router = createShellRouter({
    origin,
    shellVersion,
    handlers: {
      'shell.version': () => ({ shellVersion, protocol: PROTOCOL_VERSION }),
      keepAwake: async (payload) => ({ on: await holder.set((payload as { on: boolean }).on) }),
    },
  });
  return {
    capabilities: router.capabilities,
    keepAwakeHeld: () => holder.held(),
    reset: () => {
      router.reset();
      void holder.releaseAll();
    },
    async handle(message) {
      const out = await router.receive(message.raw, message.senderUrl);
      // A new session never inherits a lock: the old session's release would be refused as bad_session.
      if (message.kind === 'hello' && out.refused === null) void holder.releaseAll();
      return {
        script: out.reply === null ? null : deliveryScript(out.reply, router.origin),
        handshake: message.kind === 'hello' && out.refused === null,
        refused: out.refused,
      };
    },
  };
}
