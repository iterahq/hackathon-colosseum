/**
 * The web side of the bridge: the handshake, the capability check and the
 * calls. Pure TypeScript with injected I/O (`BridgeTransport`), so the same
 * code runs in the browser and in the Node tests.
 *
 * The web side refuses a message (with a named reason) unless:
 *   - it came from the shell channel of THIS window: `event.source === window`
 *     and `event.origin` is the configured origin. A frame of another origin
 *     that calls `parent.postMessage` has its own origin and source, so it is
 *     refused (foreign_origin / foreign_source). A page with the opaque origin
 *     "null" (file://) is refused (opaque_origin);
 *   - it is at most MAX_MESSAGE_BYTES (oversized), a valid envelope (malformed)
 *     of a supported version (version_mismatch);
 *   - it answers an id that the web sent and that is still open (unknown_id,
 *     replayed_id).
 * A refusal of an incoming message is reported to `onRefusal` and changes
 * nothing else.
 *
 * v1.1: an `ask` from the shell (kind `ask`, id `n...`) runs the handler that
 * web code registered with `onAsk`, after the same channel checks plus: a
 * handshake exists (no_handshake), the session is the one of this handshake
 * (bad_session), the id has the shell form (bad_id) and is new (replayed_id),
 * the method is askable and offered by the shell (unknown_method,
 * capability_absent), and the payload matches (bad_payload). An ask gets no
 * reply envelope; the handler answers with a normal call. Asks of one method
 * share one run of the handler, so a flood of asks costs one answer.
 */
import {
  type AskMethod,
  type AskTypes,
  type Envelope,
  type HelloAck,
  type Method,
  type RefusalReason,
  type Req,
  type Res,
  BridgeRefusal,
  ENVELOPE_TAG,
  MAX_MESSAGE_BYTES,
  METHODS,
  NATIVE_ID,
  SUPPORTED_PROTOCOLS,
  encode,
  isAskMethod,
  isMethod,
  originOf,
  parseEnvelope,
  utf8Length,
  validateAsk,
} from './protocol';

export type AskHandler<M extends AskMethod> = (payload: AskTypes[M]) => Promise<void> | void;

/** One incoming message, as the browser gives it to a `message` listener. */
export interface IncomingMessage {
  data: unknown;
  origin: string;
  source: unknown;
}

export interface BridgeTransport {
  /** Send one raw message to the shell. */
  send(raw: string): void;
  /** Listen for incoming messages. Returns the unsubscribe function. */
  listen(handler: (m: IncomingMessage) => void): () => void;
  /** The object that `event.source` must be for a message of the shell channel (the window). */
  self: unknown;
}

export type BridgeMode =
  | { kind: 'pending' }
  | { kind: 'shell'; protocol: number; shellVersion: string; capabilities: Method[] }
  | { kind: 'web'; reason: RefusalReason; detail?: string };

export interface BridgeClientOptions {
  /** The shell channel, or null in a browser tab. */
  transport: BridgeTransport | null;
  /** The ONE configured origin. In the browser this is `location.origin`. */
  origin: string;
  /** The version of the web build (for the shell telemetry). */
  webVersion: string;
  protocols?: readonly number[];
  timeoutMs?: number;
  maxBytes?: number;
  /** Id source; the default is a counter plus random characters. */
  newId?: () => string;
  /** Called for each refused message or call, with the reason. */
  onRefusal?: (reason: RefusalReason, detail?: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export interface BridgeClient {
  /** Start the handshake once. Resolves with the mode: `shell` or `web` (with the reason). */
  handshake(): Promise<BridgeMode>;
  /** The current mode. */
  mode(): BridgeMode;
  /** The capability check: true only after a handshake, for a capability that the shell offers. */
  has(method: Method): boolean;
  /** Call a method. Rejects with a BridgeRefusal; the caller then uses its web fallback. */
  call<M extends Method>(method: M, payload: Req<M>): Promise<Res<M>>;
  /** v1.1: run `handler` when the shell asks for `method`. Returns the unsubscribe function. */
  onAsk<M extends AskMethod>(method: M, handler: AskHandler<M>): () => void;
  dispose(): void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: BridgeRefusal) => void;
  timer: unknown;
}

export function createBridgeClient(opts: BridgeClientOptions): BridgeClient {
  const protocols = opts.protocols ?? SUPPORTED_PROTOCOLS;
  const maxBytes = opts.maxBytes ?? MAX_MESSAGE_BYTES;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const configured = originOf(opts.origin);
  let counter = 0;
  const newId =
    opts.newId ??
    (() => `w${(++counter).toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`);

  let mode: BridgeMode = { kind: 'pending' };
  let session: string | null = null;
  let helloId: string | null = null;
  let handshakeP: Promise<BridgeMode> | null = null;
  let settleHandshake: ((m: BridgeMode) => void) | null = null;
  let disposed = false;
  const pending = new Map<string, Pending>();
  const settled = new Set<string>();
  const askHandlers = new Map<AskMethod, AskHandler<AskMethod>>();
  const askRunning = new Map<AskMethod, { forceRefresh: boolean; again: AskTypes[AskMethod] | null }>();
  const askSeen = new Set<string>();
  const ASK_WINDOW = 1024;
  const refused = (reason: RefusalReason, detail?: string) => opts.onRefusal?.(reason, detail);

  const toWeb = (reason: RefusalReason, detail?: string): BridgeMode => {
    mode = { kind: 'web', reason, detail };
    session = null;
    return mode;
  };
  let handshakeTimer: unknown = null;
  const finishHandshake = (m: BridgeMode) => {
    if (handshakeTimer !== null) {
      clearTimer(handshakeTimer);
      handshakeTimer = null;
    }
    if (settleHandshake) {
      const s = settleHandshake;
      settleHandshake = null;
      s(m);
    }
  };

  function onMessage(m: IncomingMessage) {
    // Only bridge messages are ours: other code of the page also uses postMessage.
    if (typeof m.data !== 'string' || !m.data.includes(ENVELOPE_TAG)) return;
    if (configured === null) return refused('opaque_origin', 'the page has no hierarchical origin');
    if (m.source !== opts.transport?.self) return refused('foreign_source');
    const senderOrigin = originOf(m.origin);
    if (senderOrigin === null) return refused('opaque_origin', String(m.origin));
    if (senderOrigin !== configured) return refused('foreign_origin', senderOrigin);

    const parsed = parseEnvelope(m.data, maxBytes);
    if (parsed.ok === false) {
      // A reply of the wrong version to our hello: stop and use the web.
      if (parsed.reason === 'version_mismatch' && parsed.id !== null && parsed.id === helloId) {
        finishHandshake(toWeb('version_mismatch', parsed.detail));
      }
      return refused(parsed.reason, parsed.detail);
    }
    const e = parsed.envelope;
    if (e.kind === 'hello' || e.kind === 'call') return refused('malformed', `the web takes no ${e.kind}`);
    if (e.kind === 'ask') return onAskMessage(e);
    if (e.id === null) return refused('unknown_id', 'no id');

    if (e.id === helloId) {
      helloId = null;
      settled.add(e.id);
      if (e.kind === 'refusal') return finishHandshake(toWeb(e.reason, e.detail));
      const ack = e.payload as HelloAck;
      if (!ack || typeof ack.session !== 'string' || !protocols.includes(ack.protocol) || !Array.isArray(ack.capabilities)) {
        refused('malformed', 'bad hello ack');
        return finishHandshake(toWeb('malformed', 'bad hello ack'));
      }
      session = ack.session;
      mode = {
        kind: 'shell',
        protocol: ack.protocol,
        shellVersion: String(ack.shellVersion),
        capabilities: ack.capabilities.filter(isMethod),
      };
      return finishHandshake(mode);
    }

    const p = pending.get(e.id);
    if (!p) return refused(settled.has(e.id) ? 'replayed_id' : 'unknown_id', e.id);
    pending.delete(e.id);
    settled.add(e.id);
    clearTimer(p.timer);
    if (e.kind === 'refusal') p.reject(new BridgeRefusal(e.reason, e.detail));
    else p.resolve(e.payload);
  }

  function onAskMessage(e: Extract<Envelope, { kind: 'ask' }>) {
    if (mode.kind !== 'shell' || session === null) return refused('no_handshake', 'ask');
    if (e.session !== session) return refused('bad_session', 'ask');
    if (!NATIVE_ID.test(e.id)) return refused('bad_id', 'ask id form');
    if (askSeen.has(e.id)) return refused('replayed_id', e.id);
    askSeen.add(e.id);
    if (askSeen.size > ASK_WINDOW) askSeen.delete(askSeen.values().next().value as string);
    if (!isAskMethod(e.method)) return refused('unknown_method', e.method.slice(0, 40));
    if (!mode.capabilities.includes(e.method)) return refused('capability_absent', e.method);
    const bad = validateAsk(e.method, e.payload);
    if (bad) return refused('bad_payload', bad);
    if (!askHandlers.has(e.method)) return refused('capability_absent', `no web handler for ${e.method}`);
    runAsk(e.method, e.payload as AskTypes[AskMethod]);
  }

  /**
   * One run per method at a time. Asks that come during a run do not start a run each: they
   * leave ONE follow-up, and only when they ask for more than the running one (a refresh during
   * a plain read). So a burst of N asks costs at most two answers.
   */
  function runAsk(method: AskMethod, payload: AskTypes[AskMethod]) {
    const running = askRunning.get(method);
    if (running) {
      if (payload.forceRefresh && !running.forceRefresh) running.again = payload;
      return;
    }
    const state: { forceRefresh: boolean; again: AskTypes[AskMethod] | null } = { forceRefresh: payload.forceRefresh, again: null };
    askRunning.set(method, state);
    void Promise.resolve()
      .then(() => askHandlers.get(method)?.(payload))
      .catch(() => undefined)
      .finally(() => {
        askRunning.delete(method);
        if (state.again && !disposed) runAsk(method, state.again);
      });
  }

  const unlisten = opts.transport ? opts.transport.listen(onMessage) : () => {};

  function handshake(): Promise<BridgeMode> {
    if (handshakeP) return handshakeP;
    if (!opts.transport) {
      handshakeP = Promise.resolve(toWeb('no_shell'));
      return handshakeP;
    }
    if (configured === null) {
      handshakeP = Promise.resolve(toWeb('opaque_origin', opts.origin));
      return handshakeP;
    }
    const transport = opts.transport;
    handshakeP = new Promise<BridgeMode>((resolve) => {
      settleHandshake = resolve;
      helloId = newId();
      handshakeTimer = setTimer(() => {
        handshakeTimer = null;
        if (mode.kind === 'pending') {
          // A late HelloAck must not flip a page that already decided it runs as a browser.
          if (helloId !== null) settled.add(helloId);
          helloId = null;
          finishHandshake(toWeb('timeout', 'no hello ack'));
        }
      }, timeoutMs);
      const hello: Envelope = {
        tag: ENVELOPE_TAG,
        v: Math.max(...protocols),
        kind: 'hello',
        id: helloId,
        payload: { webVersion: opts.webVersion, protocols: [...protocols] },
      };
      try {
        transport.send(encode(hello));
      } catch (err) {
        finishHandshake(toWeb('no_shell', err instanceof Error ? err.message : String(err)));
      }
    });
    return handshakeP;
  }

  /**
   * A call. The shell resets its session on each top-frame load start, but a
   * failed navigation or a back-forward restore keeps this page and its cached
   * handshake, so the shell refuses the next call with `no_handshake`. Then the
   * client drops the stale handshake, handshakes ONCE more and retries the call
   * ONCE. A second `no_handshake` rejects: there is no loop. A `no_handshake`
   * of the client itself (no handshake was made) sends nothing, as before.
   */
  function call<M extends Method>(method: M, payload: Req<M>): Promise<Res<M>> {
    const sentWith = mode.kind === 'shell' ? session : null;
    return callOnce(method, payload).catch(async (err: unknown) => {
      if (!(err instanceof BridgeRefusal) || err.reason !== 'no_handshake' || sentWith === null || disposed) throw err;
      // The first call to see the refusal drops the stale handshake; the others share the new one.
      if (session === sentWith) {
        handshakeP = null;
        session = null;
        mode = { kind: 'pending' };
      }
      const m = await handshake();
      if (m.kind !== 'shell') throw err;
      return callOnce(method, payload);
    });
  }

  function callOnce<M extends Method>(method: M, payload: Req<M>): Promise<Res<M>> {
    if (!(METHODS as readonly string[]).includes(method)) {
      refused('unknown_method', String(method));
      return Promise.reject(new BridgeRefusal('unknown_method', String(method)));
    }
    if (mode.kind !== 'shell' || session === null || !opts.transport) {
      const reason: RefusalReason = mode.kind === 'web' ? mode.reason : 'no_handshake';
      return Promise.reject(new BridgeRefusal(reason === 'no_shell' ? 'no_shell' : 'no_handshake', method));
    }
    if (!mode.capabilities.includes(method)) return Promise.reject(new BridgeRefusal('capability_absent', method));
    const id = newId();
    const raw = encode({ tag: ENVELOPE_TAG, v: mode.protocol, kind: 'call', id, session, method, payload: payload ?? {} });
    if (utf8Length(raw) > maxBytes) {
      refused('oversized', method);
      return Promise.reject(new BridgeRefusal('oversized', method));
    }
    const transport = opts.transport;
    return new Promise<Res<M>>((resolve, reject) => {
      const timer = setTimer(() => {
        if (pending.delete(id)) {
          settled.add(id);
          reject(new BridgeRefusal('timeout', method));
        }
      }, timeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        transport.send(raw);
      } catch (err) {
        pending.delete(id);
        clearTimer(timer);
        reject(new BridgeRefusal('no_shell', err instanceof Error ? err.message : String(err)));
      }
    });
  }

  return {
    handshake,
    mode: () => mode,
    has: (method) => mode.kind === 'shell' && mode.capabilities.includes(method),
    call,
    onAsk(method, handler) {
      askHandlers.set(method, handler as AskHandler<AskMethod>);
      return () => {
        if (askHandlers.get(method) === (handler as AskHandler<AskMethod>)) askHandlers.delete(method);
      };
    },
    dispose() {
      disposed = true;
      unlisten();
      for (const [id, p] of pending) {
        clearTimer(p.timer);
        p.reject(new BridgeRefusal('no_handshake', `disposed ${id}`));
      }
      pending.clear();
    },
  };
}
