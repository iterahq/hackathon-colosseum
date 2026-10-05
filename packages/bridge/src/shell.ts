/**
 * The shell side of the bridge: one router that receives each raw message of
 * the WebView and decides. Pure TypeScript; the React Native host
 * (apps/ios/app/[...path].tsx) gives it the raw string and the URL of the
 * frame that sent it, and posts back the reply.
 *
 * Order of the checks (each refusal has a named reason):
 *   1. origin   the sender frame is on the configured origin (foreign_origin, opaque_origin)
 *   2. size     the raw message is at most maxBytes (oversized)
 *   3. parse    JSON, envelope tag, version, shape (malformed, version_mismatch, bad_id)
 *   4. id       the form of the id, and never seen before (bad_id, replayed_id)
 *   5. session  a call carries the session of the current handshake (no_handshake, bad_session)
 *   6. method   a method of the protocol, offered by this shell (unknown_method, capability_absent)
 *   7. payload  the schema of the method (bad_payload)
 *
 * Before the handler runs, a call of any method other than `auth.session`
 * that carries the held access token is refused (bad_payload): the token
 * enters the shell through `auth.session` only, and never leaves it in a URL
 * that the shell opens (R1, row L4). Every refusal detail is redacted.
 *
 * v1.1: `ask(method, payload)` builds an `ask` envelope (shell to web) with
 * the session of the current handshake. The web answers it with a normal call.
 *
 * A message that fails check 1 gets NO reply: the shell does not talk to a
 * frame of another origin. Each other refusal gets a refusal envelope, so the
 * web side can use its fallback.
 *
 * Why the origin of the FRAME: on iOS, react-native-webview gives each message
 * the URL of the frame that posted it (`message.frameInfo.request.URL`). The
 * script handler `window.webkit.messageHandlers.ReactNativeWebView` is
 * reachable from every frame, an iframe included, so the frame URL is the only
 * sender identity the shell gets.
 */
import {
  type AskMethod,
  type AskTypes,
  type Envelope,
  type HelloAck,
  type Method,
  type RefusalReason,
  MAX_MESSAGE_BYTES,
  MESSAGE_ID,
  NATIVE_ID,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOLS,
  ENVELOPE_TAG,
  checkOrigin,
  encode,
  isMethod,
  normaliseOrigin,
  isAskMethod,
  parseEnvelope,
  redactTokens,
  refusalEnvelope,
  validateAsk,
  validateRequest,
} from './protocol';

export type ShellHandler = (payload: unknown) => Promise<unknown> | unknown;
export type ShellHandlers = Partial<Record<Method, ShellHandler>>;

export interface ShellRouterOptions {
  /** The ONE configured origin (expo.extra.webOrigin). */
  origin: string;
  /** The version of the shell binary, `x.y.z`. */
  shellVersion: string;
  /** The native handlers. A method with no handler is not a capability. */
  handlers: ShellHandlers;
  /** The protocol versions this shell reads. Default: SUPPORTED_PROTOCOLS. */
  protocols?: readonly number[];
  maxBytes?: number;
  /** The session token of a handshake. Default: a random string. */
  newSession?: () => string;
  /** How many ids the replay check keeps. */
  replayWindow?: number;
  /**
   * The secrets that the shell holds now (the access token of `auth.session`). A call of
   * another method that carries one is refused, and every refusal detail removes them.
   */
  secrets?: () => readonly string[];
  /** The id source of an `ask`. Default: `n` + random characters. */
  newAskId?: () => string;
}

export interface ShellOutcome {
  /** The envelope to post back to the WebView, or null for no reply. */
  reply: string | null;
  /** The reason, when the message was refused. */
  refused: RefusalReason | null;
  detail?: string;
  /** The method, when the message was a call. */
  method?: string;
}

const defaultAskId = () => {
  let s = 'n';
  for (let i = 0; i < 2; i++) s += Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return s;
};

const defaultSession = () => {
  let s = 's';
  for (let i = 0; i < 4; i++) s += Math.random().toString(36).slice(2, 10);
  return s;
};

export interface ShellRouter {
  receive(raw: unknown, senderUrl: unknown): Promise<ShellOutcome>;
  /**
   * v1.1: the raw `ask` envelope for the page, or null when there is no handshake (the shell
   * does not ask a page it has not shaken hands with). The host delivers it with
   * `deliveryScript`, so it reaches only a page on the configured origin.
   */
  ask<M extends AskMethod>(method: M, payload: AskTypes[M]): string | null;
  /** Forget the handshake. The host calls it on each top-frame load start. */
  reset(): void;
  readonly capabilities: Method[];
  readonly origin: string;
}

export function createShellRouter(opts: ShellRouterOptions): ShellRouter {
  const origin = normaliseOrigin(opts.origin);
  const protocols = opts.protocols ?? SUPPORTED_PROTOCOLS;
  const maxBytes = opts.maxBytes ?? MAX_MESSAGE_BYTES;
  const newSession = opts.newSession ?? defaultSession;
  const window = opts.replayWindow ?? 1024;
  const capabilities = (Object.keys(opts.handlers) as Method[]).filter((m) => isMethod(m) && opts.handlers[m]).sort();
  const secrets = opts.secrets ?? (() => []);
  const newAskId = opts.newAskId ?? defaultAskId;
  let session: string | null = null;
  const seen = new Set<string>();

  /** Remove each held secret, then each JWT-shaped run, from a text that may be logged. */
  const scrub = (text: string | undefined): string | undefined => {
    if (text === undefined) return undefined;
    let out = text;
    for (const secret of secrets()) if (secret) out = out.split(secret).join(`${secret.slice(0, 8)}...[redacted]`);
    return redactTokens(out);
  };

  const remember = (id: string) => {
    seen.add(id);
    if (seen.size > window) seen.delete(seen.values().next().value as string);
  };
  const refuse = (id: string | null, reason: RefusalReason, rawDetail?: string, method?: string): ShellOutcome => {
    const detail = scrub(rawDetail);
    return { reply: encode(refusalEnvelope(id, reason, detail)), refused: reason, detail, method };
  };

  async function receive(raw: unknown, senderUrl: unknown): Promise<ShellOutcome> {
    const o = checkOrigin(senderUrl, origin);
    if (o.ok === false) return { reply: null, refused: o.reason, detail: scrub(o.detail) };

    const parsed = parseEnvelope(raw, maxBytes);
    if (parsed.ok === false) return refuse(parsed.id && MESSAGE_ID.test(parsed.id) ? parsed.id : null, parsed.reason, parsed.detail);
    const e = parsed.envelope;
    // The shell never takes a refusal, a result or an ask from the web.
    if (e.kind === 'refusal' || e.kind === 'result' || e.kind === 'ask') return refuse(null, 'malformed', `the shell takes no ${e.kind}`);
    if (!protocols.includes(e.v)) return refuse(MESSAGE_ID.test(e.id) ? e.id : null, 'version_mismatch', `v=${e.v}`);

    if (!MESSAGE_ID.test(e.id)) return refuse(null, 'bad_id', 'id form');
    if (seen.has(e.id)) return refuse(e.id, 'replayed_id');
    remember(e.id);

    if (e.kind === 'hello') {
      const common = e.payload.protocols.filter((p) => protocols.includes(p));
      if (!common.length) return refuse(e.id, 'version_mismatch', `web reads ${e.payload.protocols.join(',') || 'none'}`);
      session = newSession();
      const ack: HelloAck = { protocol: Math.max(...common), session, shellVersion: opts.shellVersion, capabilities };
      const reply: Envelope = { tag: ENVELOPE_TAG, v: PROTOCOL_VERSION, kind: 'result', id: e.id, payload: ack };
      return { reply: encode(reply), refused: null };
    }

    // e.kind === 'call'
    if (session === null) return refuse(e.id, 'no_handshake', undefined, e.method);
    if (e.session !== session) return refuse(e.id, 'bad_session', undefined, e.method);
    if (!isMethod(e.method)) return refuse(e.id, 'unknown_method', e.method.slice(0, 40), e.method);
    const handler = opts.handlers[e.method];
    if (!handler) return refuse(e.id, 'capability_absent', e.method, e.method);
    const bad = validateRequest(e.method, e.payload);
    if (bad) return refuse(e.id, 'bad_payload', bad, e.method);
    // The access token enters through auth.session only: never in a URL, a share text or a file name.
    if (e.method !== 'auth.session' && typeof raw === 'string' && secrets().some((t) => t && raw.includes(t))) {
      return refuse(e.id, 'bad_payload', 'carries the session token', e.method);
    }
    try {
      const result = await handler(e.payload ?? {});
      const reply: Envelope = { tag: ENVELOPE_TAG, v: PROTOCOL_VERSION, kind: 'result', id: e.id, payload: result ?? {} };
      return { reply: encode(reply), refused: null, method: e.method };
    } catch (err) {
      return refuse(e.id, 'handler_failed', err instanceof Error ? err.message : String(err), e.method);
    }
  }

  function ask<M extends AskMethod>(method: M, payload: AskTypes[M]): string | null {
    if (session === null || !isAskMethod(method) || validateAsk(method, payload) !== null) return null;
    const id = newAskId();
    if (!NATIVE_ID.test(id)) throw new Error('ask id form');
    const e: Envelope = { tag: ENVELOPE_TAG, v: PROTOCOL_VERSION, kind: 'ask', id, session, method, payload };
    return encode(e);
  }

  return {
    receive,
    ask,
    reset() {
      session = null;
    },
    capabilities,
    origin,
  };
}

/**
 * The JavaScript that the host injects to deliver a reply to the page. It
 * posts to the window with the configured origin as `targetOrigin`: if the top
 * frame is on another origin (a navigated-away page), WebKit drops the
 * message, so a reply never reaches a foreign page.
 */
export function deliveryScript(reply: string, origin: string): string {
  return `(function(){try{window.postMessage(${JSON.stringify(reply)},${JSON.stringify(origin)});}catch(e){}})();true;`;
}
