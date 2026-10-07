/**
 * The bridge side of the shell (PLAN ADR-9): the reader of a bridge message (`readBridgeEnvelope`) and the routers that
 * answer it. It sits beside `consoleMessage.ts`; the console reader stays the only reader of the
 * console forwarder's messages, this reader the only reader of bridge messages. Neither
 * touches the other's shape, and `receiveShellMessage.ts` calls them in that order.
 *
 * Capabilities: `shell.version`, `keepAwake` (R-8, held by `keepAwakeHolder.ts`) and `auth.session`
 * (R-12, ADR-10, held by `nativeSession.ts`): the page hands over its access token, or says it signed
 * out. No navigation command, no file access: a method of the protocol without a handler here answers
 * `capability_absent`. Each payload is validated by the router before the handler runs.
 *
 * `auth.session` carries a secret, so it exists only for a sender the shell can attribute to its frame
 * (`senderAttributed`). There are two routers: one with `auth.session`, one without. A message whose
 * sender is not attributed goes to the second one, so its handshake never lists `auth.session`, a call
 * of it answers `capability_absent`, and the shell never asks that page for a token. The session token
 * of both comes from the host's random source (`sessionToken.ts`), never `Math.random`. A build that
 * names no backend passes no session: then NEITHER router has `auth.session`, for any sender.
 *
 * Pure TypeScript: no React Native import.
 */
import type { KeepAwakeClaims } from './keepAwakeHolder';
import type { NativeSession } from './nativeSession';
import { type FillRandom, askIdSource, sessionTokenSource } from './sessionToken';
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  createShellRouter,
  deliveryScript,
  parseEnvelope,
  type RefusalReason,
  type ShellHandlers,
} from '@iterahq/shell-bridge';

/**
 * Can the shell tell which frame sent a message whose reported URL is `url` (already on the app origin)?
 *
 * - iOS: yes. react-native-webview 13.16.1 reports `message.frameInfo.request.URL`, the URL of the
 *   sender frame (`apple/RNCWebViewImpl.m`); a sandboxed `srcdoc` frame is `about:srcdoc`, which the
 *   origin gate already dropped.
 * - Android: only on the `WebMessageListener` path, which reports the ORIGIN of the sender frame and
 *   nothing else (`sourceOrigin.toString()`, `RNCWebView.java`): the URL is then exactly the app origin,
 *   with no path. On a System WebView without that feature the library falls back to
 *   `addJavascriptInterface` and reports the URL of the TOP frame for every frame (`mWebView.getUrl()`),
 *   which always has a path. So an Android URL with a path means "sender unknown": a sandboxed frame
 *   that runs learner code would look like the page.
 * - Anything else: no.
 *
 * Neither platform reports whether the sender is the main frame, so a sub-frame on the app origin itself
 * cannot be told from the page. Such a frame is same-origin script: it already reads the page's storage.
 */
export function senderAttributed(platform: string, url: string, appOrigin: string): boolean {
  if (platform === 'ios') return true;
  if (platform === 'android') return url === appOrigin;
  return false;
}

/** A message that passed the native gate. The router still checks id, session, method and payload. */
export interface BridgeMessage {
  raw: string;
  senderUrl: string;
  kind: 'hello' | 'call' | 'other';
  /** `senderAttributed` for this message. Only an attributed message reaches the router that has `auth.session`. */
  attributed: boolean;
}

/**
 * The envelope check, for a caller that has already proved the frame is on the app origin (`receiveShellMessage`, by
 * `messageSize`, which drops a frame on any other origin with no reply): `url` is the checked frame URL and `appOrigin` the
 * normalised origin. A same-origin sub-frame cannot be told from the top frame by this URL; it can only speak to the
 * router, which holds one handshake session per page load, and every reply goes to the top frame.
 * What is dropped silently: a non-string, a message above the size cap, and anything that is not a bridge
 * envelope at all (the forwarder's messages included). A bridge envelope with a bad version or id passes,
 * so the router answers it with a named refusal. The check inside `parseEnvelope` (packages/bridge, pinned) stays as it is.
 */
export function readBridgeEnvelope(data: unknown, url: string, appOrigin: string, platform: string): BridgeMessage | null {
  if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return null;
  const attributed = senderAttributed(platform, url, appOrigin);
  const parsed = parseEnvelope(data);
  if (parsed.ok === false) {
    return parsed.reason === 'version_mismatch' || parsed.reason === 'bad_id' ? { raw: data, senderUrl: url, kind: 'other', attributed } : null;
  }
  const kind = parsed.envelope.kind;
  return { raw: data, senderUrl: url, kind: kind === 'hello' || kind === 'call' ? kind : 'other', attributed };
}

export interface ShellBridgeOptions {
  /** The ONE configured web origin (`expo.extra.webOrigin`). */
  origin: string;
  /** The version of this shell binary, `x.y.z` (`expo.version`). */
  shellVersion: string;
  /** The process-wide registry behind `keepAwake` (one per process, shared by every mounted WebView). */
  keepAwake: KeepAwakeClaims;
  /**
   * The process-wide holder of the access token copy (one per process, shared by every mounted WebView),
   * or null when the build names no backend: `auth.session` is then not a capability of this shell.
   */
  session: NativeSession | null;
  /** Cryptographically strong random bytes (`getRandomValues` of `expo-crypto`), for the session token and the ask id. */
  random: FillRandom;
}

export interface ShellBridgeOutcome {
  /** The script that delivers the reply to the page (posts to the app origin only), or null for no reply. */
  script: string | null;
  /** True when the message was a hello that the router accepted. */
  handshake: boolean;
  /** True when that handshake listed `auth.session` (an attributed sender). */
  sessionOffered: boolean;
  refused: RefusalReason | null;
}

export interface ShellBridge {
  /** Everything this shell can offer to an attributed sender. An unattributed one gets the same list without `auth.session`. */
  readonly capabilities: readonly string[];
  handle(message: BridgeMessage): Promise<ShellBridgeOutcome>;
  /**
   * Forget both handshakes, release the screen lock and drop the token copy this WebView delivered.
   * Called on each top-frame load start, on relaunch and on unmount.
   */
  reset(): void;
  /** True while the page holds the screen awake. */
  keepAwakeHeld(): boolean;
  /**
   * The script that asks the page for its session (`ask auth.session`), or null when no attributed page
   * has shaken hands. It posts to the app origin only; the page answers with a normal `auth.session` call.
   */
  askSession(forceRefresh: boolean): string | null;
}

let nextOwner = 0;

export function createShellBridge({ origin, shellVersion, keepAwake, session, random }: ShellBridgeOptions): ShellBridge {
  const owner = `webview-${(nextOwner += 1)}`;
  const holder = keepAwake.owner(owner);
  const handlers: ShellHandlers = {
    'shell.version': () => ({ shellVersion, protocol: PROTOCOL_VERSION }),
    keepAwake: async (payload) => ({ on: await holder.set((payload as { on: boolean }).on) }),
  };
  const shared = { origin, shellVersion, newSession: sessionTokenSource(random), newAskId: askIdSource(random), secrets: session?.session.secrets };
  const withSession = createShellRouter({ ...shared, handlers: session === null ? handlers : { ...handlers, 'auth.session': session.handlerFor(owner) } });
  const withoutSession = createShellRouter({ ...shared, handlers });
  return {
    capabilities: withSession.capabilities,
    keepAwakeHeld: () => holder.held(),
    reset: () => {
      withSession.reset();
      withoutSession.reset();
      session?.release(owner);
      void holder.releaseAll();
    },
    askSession(forceRefresh) {
      if (session === null) return null;
      const raw = withSession.ask('auth.session', { forceRefresh });
      return raw === null ? null : deliveryScript(raw, withSession.origin);
    },
    async handle(message) {
      const router = message.attributed ? withSession : withoutSession;
      const out = await router.receive(message.raw, message.senderUrl);
      const handshake = message.kind === 'hello' && out.refused === null;
      // A new session never inherits a lock: the old session's release would be refused as bad_session.
      if (handshake) void holder.releaseAll();
      return {
        script: out.reply === null ? null : deliveryScript(out.reply, router.origin),
        handshake,
        sessionOffered: handshake && message.attributed && session !== null,
        refused: out.refused,
      };
    },
  };
}
