/**
 * Bridge protocol v1: the typed, versioned messages between the web UI in the
 * WebView and the native shell (plan 20261002-lesson-studio-native-migration,
 * section 1.5, section 7 rules 6 and 7, task T28).
 *
 * The bridge is a SECURITY BOUNDARY. S16 found that server CORS does not depend
 * on the origin, so the origin check here guards the MESSAGE CHANNEL, not the
 * server calls. Both sides refuse a message that does not come from the one
 * configured origin, and every refusal has a named reason (`RefusalReason`).
 *
 * Pure TypeScript: no DOM, no React Native, no `URL` (the Hermes `URL` is
 * partial, and Node gives a custom scheme the opaque origin "null"). The same
 * file runs in the browser, in Node (tests) and in Hermes (the shell).
 */

import { BASE64_CANONICAL, base64DecodedLength, decodeBase64Into } from './base64';

/** The protocol version of this build. Each envelope carries it in `v`. */
export const PROTOCOL_VERSION = 1 as const;

/** The protocol versions this build reads. A message with another `v` is refused. */
export const SUPPORTED_PROTOCOLS: readonly number[] = [PROTOCOL_VERSION];

/** The tag of every envelope. A message without it is not a bridge message. */
export const ENVELOPE_TAG = 'dfl-bridge' as const;

/**
 * The upper limit of one raw message, in UTF-8 bytes, on both sides. It is
 * checked BEFORE `JSON.parse`. `file.save` takes a URL, so 64 KiB is large for
 * it. `file.saveBytes` (shell 0.3.0) is the one method that carries bytes, and
 * it carries them in chunks of SAVE_CHUNK_BYTES, so no message gets near this
 * limit. Bridge v2 moves media as file handles, not bytes.
 */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * `file.saveBytes`: a file with no https URL (a `blob:` export: PDF, image)
 * crosses the bridge as base64 chunks. A chunk is 32 KiB of file bytes, so
 * its base64 text is 43 692 characters and the envelope stays under
 * MAX_MESSAGE_BYTES. The file is at most 32 MiB, so at most 1024 chunks. The
 * shell holds one file in memory at a time, so 32 MiB is its worst case.
 */
export const SAVE_CHUNK_BYTES = 32 * 1024;
export const MAX_SAVE_BYTES = 32 * 1024 * 1024;
export const MAX_SAVE_CHUNKS = MAX_SAVE_BYTES / SAVE_CHUNK_BYTES;
/** The id that ties the chunks of one file together: 8..40 characters of [A-Za-z0-9_-]. */
export const TRANSFER_ID = /^[A-Za-z0-9_-]{8,40}$/;

/** The ids of the web side: `w` + 8..63 characters of [A-Za-z0-9_-]. */
export const MESSAGE_ID = /^w[A-Za-z0-9_-]{8,63}$/;

/** The ids of the shell side (an `ask`, v1.1): `n` + 8..63 characters of [A-Za-z0-9_-]. */
export const NATIVE_ID = /^n[A-Za-z0-9_-]{8,63}$/;

/** The methods of bridge v1. A capability is the name of a method. */
export const METHODS = [
  'keepAwake',
  'haptics',
  'share',
  'file.save',
  'file.saveBytes',
  'link.open',
  'permission.state',
  'lifecycle.canReload',
  'shell.version',
  // v1.1 (T19, spike S20b). Additive: the protocol stays 1. A shell offers them only
  // from the shell version whose contract file lists them; an older shell refuses them
  // with capability_absent, and the web keeps its own uploader.
  'auth.session',
  'upload.start',
  'upload.status',
  'upload.cancel',
  // v1.1 (L1-WIRE, shell 0.6.0). The web asks the shell for a NATIVE take. The shell answers
  // `opened: false` while its remote flag `capture.native` is off, and the web runs its own
  // capture flow exactly as before.
  'capture.open',
  'capture.status',
  'capture.cancel',
] as const;
export type Method = (typeof METHODS)[number];

export function isMethod(value: unknown): value is Method {
  return typeof value === 'string' && (METHODS as readonly string[]).includes(value);
}

/** Every reason for which a side refuses a message. The names are part of the contract. */
export const REFUSAL_REASONS = [
  'foreign_origin', // the sender is not the configured origin (iframe, navigated-away page, file://)
  'opaque_origin', // the sender has the opaque origin "null" (file://, sandboxed frame)
  'foreign_source', // web side: the message did not come from the shell channel of this window
  'oversized', // the raw message is above MAX_MESSAGE_BYTES
  'malformed', // not JSON, or not an envelope of this protocol
  'version_mismatch', // the envelope `v` is not a supported protocol version
  'bad_id', // the id does not have the form of MESSAGE_ID (a forged id)
  'replayed_id', // the id was seen before (a replayed message)
  'unknown_id', // web side: a reply to an id that the web never sent (a forged reply)
  'bad_session', // the session token is not the one of the current handshake
  'no_handshake', // a call before the handshake, or after a reload reset it
  'unknown_method', // the method is not a method of this protocol
  'capability_absent', // the method exists, but this shell does not offer it
  'bad_payload', // the payload does not match the schema of the method
  'handler_failed', // the native handler threw
  'timeout', // web side: no reply in time
  'no_shell', // web side: no shell channel at all (a browser tab)
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export class BridgeRefusal extends Error {
  readonly reason: RefusalReason;
  readonly detail?: string;
  constructor(reason: RefusalReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'BridgeRefusal';
    this.reason = reason;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- envelopes

export interface HelloPayload {
  webVersion: string;
  protocols: number[];
}

export interface HelloAck {
  protocol: number;
  session: string;
  shellVersion: string;
  capabilities: Method[];
}

/**
 * v1.1, additive: the methods that the SHELL may ask the web to run. An `ask` gets no reply
 * envelope. The web answers it with a normal `call` of the same method, so the answer goes
 * through every check of the shell router (origin, session, id, schema). Only `auth.session`:
 * the shell asks for the session when it needs one (R1, ADR-1).
 */
export const ASK_METHODS = ['auth.session'] as const;
export type AskMethod = (typeof ASK_METHODS)[number];
export interface AskTypes {
  'auth.session': { forceRefresh: boolean };
}

export function isAskMethod(value: unknown): value is AskMethod {
  return typeof value === 'string' && (ASK_METHODS as readonly string[]).includes(value);
}

/** Validate an ask payload. Returns null when valid, or the detail of the `bad_payload` refusal. */
export function validateAsk(method: AskMethod, payload: unknown): string | null {
  if (!isObj(payload)) return 'payload is not an object';
  switch (method) {
    case 'auth.session':
      return onlyKeys(payload, ['forceRefresh']) ?? (typeof payload.forceRefresh === 'boolean' ? null : 'forceRefresh must be a boolean');
  }
}

export type Envelope =
  | { tag: typeof ENVELOPE_TAG; v: number; kind: 'hello'; id: string; payload: HelloPayload }
  | { tag: typeof ENVELOPE_TAG; v: number; kind: 'ask'; id: string; session: string; method: string; payload: unknown }
  | { tag: typeof ENVELOPE_TAG; v: number; kind: 'call'; id: string; session: string; method: string; payload: unknown }
  | { tag: typeof ENVELOPE_TAG; v: number; kind: 'result'; id: string; payload: unknown }
  | {
      tag: typeof ENVELOPE_TAG;
      v: number;
      kind: 'refusal';
      id: string | null;
      reason: RefusalReason;
      detail?: string;
      supported?: number[];
    };

/**
 * The refusal envelope is FROZEN across protocol versions: `tag`, `v`, `kind`,
 * `id`, `reason`, `supported`. A side reads a `version_mismatch` refusal of any
 * `v`, so that a newer and an older side can still agree to stop. Every other
 * envelope with an unsupported `v` is refused.
 */
export function refusalEnvelope(id: string | null, reason: RefusalReason, detail?: string): Envelope {
  const e: Envelope = { tag: ENVELOPE_TAG, v: PROTOCOL_VERSION, kind: 'refusal', id, reason };
  if (detail) e.detail = redactTokens(detail).slice(0, 200);
  if (reason === 'version_mismatch') e.supported = [...SUPPORTED_PROTOCOLS];
  return e;
}

/** UTF-8 length of a string, with no TextEncoder (not every Hermes has it). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

type Parsed = { ok: true; envelope: Envelope } | { ok: false; reason: RefusalReason; id: string | null; detail?: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Size, JSON, tag, version and shape, in this order. The size check runs on
 * the raw string before any parse, so an oversized message costs no parse.
 */
export function parseEnvelope(raw: unknown, maxBytes = MAX_MESSAGE_BYTES): Parsed {
  if (typeof raw !== 'string') return { ok: false, reason: 'malformed', id: null, detail: 'not a string' };
  // A quick bound first: each UTF-16 unit is at most 3 UTF-8 bytes.
  if (raw.length > maxBytes || utf8Length(raw) > maxBytes) {
    return { ok: false, reason: 'oversized', id: null, detail: `above ${maxBytes} bytes` };
  }
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed', id: null, detail: 'not JSON' };
  }
  if (!isObj(o) || o.tag !== ENVELOPE_TAG) return { ok: false, reason: 'malformed', id: null, detail: 'not a bridge envelope' };
  const id = typeof o.id === 'string' ? o.id : null;
  if (typeof o.v !== 'number' || !Number.isInteger(o.v)) return { ok: false, reason: 'malformed', id, detail: 'no version' };
  // The frozen refusal: read across versions (see refusalEnvelope).
  if (o.kind === 'refusal') {
    if (typeof o.reason !== 'string' || !(REFUSAL_REASONS as readonly string[]).includes(o.reason)) {
      return { ok: false, reason: 'malformed', id, detail: 'unknown refusal reason' };
    }
    if (!SUPPORTED_PROTOCOLS.includes(o.v) && o.reason !== 'version_mismatch') {
      return { ok: false, reason: 'version_mismatch', id, detail: `v=${o.v}` };
    }
    const supported = Array.isArray(o.supported) ? o.supported.filter((x): x is number => Number.isInteger(x)) : undefined;
    return {
      ok: true,
      envelope: {
        tag: ENVELOPE_TAG,
        v: o.v,
        kind: 'refusal',
        id,
        reason: o.reason as RefusalReason,
        detail: typeof o.detail === 'string' ? o.detail : undefined,
        supported,
      },
    };
  }
  if (!SUPPORTED_PROTOCOLS.includes(o.v)) return { ok: false, reason: 'version_mismatch', id, detail: `v=${o.v}` };
  if (id === null) return { ok: false, reason: 'bad_id', id: null, detail: 'no id' };
  if (o.kind === 'hello') {
    const p = o.payload;
    if (!isObj(p) || typeof p.webVersion !== 'string' || !Array.isArray(p.protocols)) {
      return { ok: false, reason: 'malformed', id, detail: 'bad hello' };
    }
    return {
      ok: true,
      envelope: {
        tag: ENVELOPE_TAG,
        v: o.v,
        kind: 'hello',
        id,
        payload: { webVersion: p.webVersion.slice(0, 64), protocols: p.protocols.filter((x): x is number => Number.isInteger(x)) },
      },
    };
  }
  if (o.kind === 'call') {
    if (typeof o.method !== 'string') return { ok: false, reason: 'malformed', id, detail: 'no method' };
    if (typeof o.session !== 'string') return { ok: false, reason: 'bad_session', id, detail: 'no session' };
    return { ok: true, envelope: { tag: ENVELOPE_TAG, v: o.v, kind: 'call', id, session: o.session, method: o.method, payload: o.payload } };
  }
  if (o.kind === 'ask') {
    if (typeof o.method !== 'string') return { ok: false, reason: 'malformed', id, detail: 'no method' };
    if (typeof o.session !== 'string') return { ok: false, reason: 'bad_session', id, detail: 'no session' };
    return { ok: true, envelope: { tag: ENVELOPE_TAG, v: o.v, kind: 'ask', id, session: o.session, method: o.method, payload: o.payload } };
  }
  if (o.kind === 'result') return { ok: true, envelope: { tag: ENVELOPE_TAG, v: o.v, kind: 'result', id, payload: o.payload } };
  return { ok: false, reason: 'malformed', id, detail: 'unknown kind' };
}

export const encode = (e: Envelope): string => JSON.stringify(e);

// ---------------------------------------------------------------- origins

/**
 * The origin of a URL, as `scheme://host[:port]`, lower case, default port
 * removed. `null` for an opaque origin (file:, about:, data:, blob:, a URL with
 * user info, or a string that is not an absolute hierarchical URL).
 *
 * No `URL` object: Node and Hermes give a custom scheme such as
 * `dfl-lesson-studio://localhost` the opaque origin "null", but ADR-3 names a
 * custom scheme as the store origin. This parser keeps it comparable. In
 * WKWebView, a scheme with a WKURLSchemeHandler has a tuple origin:
 * `location.origin` and `MessageEvent.origin` are `dfl-lesson-studio://localhost`
 * (L4-SCHEME, iOS 18.6 simulator).
 */
export function originOf(url: string): string | null {
  if (typeof url !== 'string') return null;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/.exec(url.trim());
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  if (scheme === 'file' || scheme === 'blob' || scheme === 'data' || scheme === 'about' || scheme === 'javascript') return null;
  const authority = m[2].toLowerCase();
  if (!authority || authority.includes('@') || authority.includes('\\')) return null;
  const host = (scheme === 'https' && authority.endsWith(':443')) || (scheme === 'http' && authority.endsWith(':80'))
    ? authority.slice(0, authority.lastIndexOf(':'))
    : authority;
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host) && !/^\[[0-9a-f:.]+\](:\d{1,5})?$/.test(host)) return null;
  return `${scheme}://${host}`;
}

/**
 * Normalise the ONE configured origin. Refuses a value with a path, a query,
 * an opaque origin, or plain http. A custom scheme (`<scheme>://localhost`,
 * ADR-3) is accepted here; the shell decides separately when it may use one.
 */
export function normaliseOrigin(value: string): string {
  const o = originOf(value);
  if (!o) throw new Error(`bridge origin is not a hierarchical origin: ${value}`);
  if (o.startsWith('http://')) throw new Error(`bridge origin must not be plain http: ${value}`);
  const rest = value.trim().slice(o.length);
  if (rest !== '' && rest !== '/') {
    // Allow a default port written out, e.g. https://x:443
    if (!/^:(443|80)\/?$/.test(rest)) throw new Error(`bridge origin must have no path, query or hash: ${value}`);
  }
  return o;
}

export type OriginVerdict = { ok: true } | { ok: false; reason: 'foreign_origin' | 'opaque_origin'; detail: string };

/** Is `senderUrl` (the URL of the frame that sent) on the configured origin? */
export function checkOrigin(senderUrl: unknown, configuredOrigin: string): OriginVerdict {
  const o = typeof senderUrl === 'string' ? originOf(senderUrl) : null;
  if (o === null) return { ok: false, reason: 'opaque_origin', detail: String(senderUrl).slice(0, 80) };
  if (o !== configuredOrigin) return { ok: false, reason: 'foreign_origin', detail: o };
  return { ok: true };
}

// ---------------------------------------------------------------- payload schemas

export const HAPTIC_STYLES = ['light', 'medium', 'heavy', 'selection', 'success', 'warning', 'error'] as const;
export type HapticStyle = (typeof HAPTIC_STYLES)[number];
export type PermissionKind = 'camera' | 'microphone';
export type PermissionStateValue = 'granted' | 'denied' | 'undetermined' | 'unknown';

/** One chunk of `file.saveBytes`. `seq` runs 0..total-1, in order. Every chunk repeats the file facts, and the shell refuses a chunk that disagrees with the first. */
export interface SaveBytesChunk {
  transfer: string;
  seq: number;
  total: number;
  size: number;
  filename: string;
  mime?: string;
  data: string;
}

/**
 * The media types of a native take that dfl-render accepts on /upload/multipart
 * (its ALLOWED_CONTENT_TYPES, minus the WebM types that a native recorder never writes).
 */
export const UPLOAD_CONTENT_TYPES = ['video/mp4', 'video/quicktime', 'audio/mp4', 'audio/m4a'] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

/** A handle of the native take store. Never a path and never bytes: the web cannot name a file. */
export const TAKE_REF = /^take_[A-Za-z0-9_-]{8,64}$/;
/** The id of a native upload job. */
export const UPLOAD_JOB_ID = /^up_[A-Za-z0-9_-]{8,64}$/;
/** The id of one native capture request (`capture.open`). */
export const CAPTURE_ID = /^cap_[A-Za-z0-9_-]{8,64}$/;
/** A project id or a slide id in `capture.open`: a label for the take row, never a path. */
export const CAPTURE_SUBJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const CAPTURE_FACINGS = ['user', 'environment'] as const;
export type CaptureFacing = (typeof CAPTURE_FACINGS)[number];

/**
 * `capture.open`: the shell shows its native record screen over the WebView and answers at
 * once (the web client times out after 5 s, and a take lasts up to 600 s). The web then polls
 * `capture.status`. `opened: false` = no native capture now (the flag `capture.native` is off,
 * the binary has no capture module, or a capture is already open): the web runs its own flow.
 */
export interface CaptureOpenReq {
  mode: 'webcam';
  facing: CaptureFacing;
  projectId: string;
  slideId: string;
}
export type CaptureState = 'open' | 'accepted' | 'cancelled' | 'failed';
/** The take that the person accepted ("Use it") on the native screen. The file stays in the shell. */
export interface CaptureTake {
  takeRef: string;
  durationMs: number;
  sizeBytes: number;
  contentType: UploadContentType;
  width: number;
  height: number;
  /** The take ended because the app left the foreground (L1-SIGN); it keeps what was recorded. */
  interrupted: boolean;
}
export interface CaptureStatus {
  state: CaptureState;
  take?: CaptureTake;
  error?: string;
}

/** The shape of a Supabase access token (a JWS in compact form). The shell never logs it. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** The upper limit of an access token in `auth.session`. A Supabase token is about 1 KiB. */
export const MAX_ACCESS_TOKEN_CHARS = 4096;

/** The claims of an access token that the shell reads: the user and the expiry. */
export interface TokenClaims {
  /** auth.users.id (`sub`). */
  sub: string;
  /** Expiry, epoch SECONDS (`exp`). */
  exp: number;
}

/**
 * Read `sub` and `exp` from the payload of a JWT. It does NOT verify the signature: the shell
 * is not the audience of the token, dfl-render verifies it. The shell uses the claims only to
 * know whose token it holds and when the token stops being valid. Null when the token is not
 * a JWT with a string `sub` and an integer `exp`.
 */
export function readTokenClaims(token: unknown): TokenClaims | null {
  if (typeof token !== 'string' || token.length > MAX_ACCESS_TOKEN_CHARS || !JWT_SHAPE.test(token)) return null;
  const part = token.split('.')[1];
  if (part.length % 4 === 1) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  if (!BASE64_CANONICAL.test(b64)) return null;
  try {
    const bytes = new Uint8Array(base64DecodedLength(b64));
    decodeBase64Into(b64, bytes, 0);
    const claims: unknown = JSON.parse(utf8Decode(bytes));
    if (!isObj(claims) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) return null;
    if (!Number.isSafeInteger(claims.exp) || (claims.exp as number) <= 0) return null;
    return { sub: claims.sub, exp: claims.exp as number };
  } catch {
    return null;
  }
}

/** UTF-8 to string, with no TextDecoder (not every Hermes has it). Throws on a bad sequence. */
function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xc2 && b < 0xe0) cp = ((b & 0x1f) << 6) | cont(bytes, i++);
    else if (b >= 0xe0 && b < 0xf0) cp = ((b & 0x0f) << 12) | (cont(bytes, i++) << 6) | cont(bytes, i++);
    else if (b >= 0xf0 && b < 0xf5) cp = ((b & 0x07) << 18) | (cont(bytes, i++) << 12) | (cont(bytes, i++) << 6) | cont(bytes, i++);
    else throw new Error('bad UTF-8');
    out += String.fromCodePoint(cp);
  }
  return out;
}
function cont(bytes: Uint8Array, i: number): number {
  const c = bytes[i];
  if (c === undefined || (c & 0xc0) !== 0x80) throw new Error('bad UTF-8');
  return c & 0x3f;
}

/**
 * Replace each JWT-shaped run (`eyJ...` header, three dot parts) with its first 8 characters
 * and `...[redacted]`. Every refusal detail goes through it, so a token cannot reach the log
 * of the shell (`console.warn` of the host) or the page through a refusal (R1, L rows).
 */
export function redactTokens(text: string): string {
  return text.replace(/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, (t) => `${t.slice(0, 8)}...[redacted]`);
}

export type UploadState = 'queued' | 'uploading' | 'completing' | 'needs_token' | 'done' | 'failed' | 'cancelled';
export interface UploadStatus {
  state: UploadState;
  partsDone: number;
  partCount: number;
  sizeBytes: number;
  /** The S3 key and the public URL, when dfl-render completed the upload. */
  path?: string;
  url?: string;
  error?: string;
}

/**
 * `auth.session` carries the ACCESS token only. The WebView owns the Supabase session and its
 * refresh (plan L1 item 6, ADR-1 Option A of plan 20261003-lesson-studio-native-later-phases).
 * No refresh token crosses the bridge: two holders of one refresh token race on its rotation,
 * and a lost rotation can revoke the whole session (T19 run B). The schema has no field for
 * one, and `validateRequest` refuses every unknown field.
 */
export type AuthSessionReq = { accessToken: string; expiresAt: number } | { signedOut: true };

export interface MethodTypes {
  keepAwake: { req: { on: boolean }; res: { on: boolean } };
  haptics: { req: { style: HapticStyle }; res: Record<string, never> };
  share: { req: { title?: string; text?: string; url?: string }; res: { completed: boolean } };
  'file.save': { req: { url: string; filename: string; mime?: string }; res: { completed: boolean } };
  /** `saved` is true on the last chunk, after the file is on the disk and the share sheet is open (the shell does not wait for the user to close the sheet). */
  'file.saveBytes': { req: SaveBytesChunk; res: { received: number; saved: boolean } };
  'link.open': { req: { url: string }; res: { opened: boolean } };
  'permission.state': { req: { kind: PermissionKind }; res: { state: PermissionStateValue } };
  'lifecycle.canReload': { req: { canReload: boolean; reason?: string }; res: Record<string, never> };
  'shell.version': { req: Record<string, never>; res: { shellVersion: string; protocol: number } };
  'auth.session': { req: AuthSessionReq; res: { stored: boolean } };
  'upload.start': { req: { takeRef: string; filename: string; contentType: UploadContentType }; res: { jobId: string } };
  'upload.status': { req: { jobId: string }; res: UploadStatus };
  'upload.cancel': { req: { jobId: string }; res: { cancelled: boolean } };
  'capture.open': { req: CaptureOpenReq; res: { opened: boolean; captureId?: string } };
  'capture.status': { req: { captureId: string }; res: CaptureStatus };
  'capture.cancel': { req: { captureId: string }; res: { cancelled: boolean } };
}
export type Req<M extends Method> = MethodTypes[M]['req'];
export type Res<M extends Method> = MethodTypes[M]['res'];

const isHttpsUrl = (v: unknown, max = 2048): v is string =>
  typeof v === 'string' && v.length <= max && /^https:\/\//i.test(v) && originOf(v) !== null;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
/**
 * A file name for `file.save`: one plain path component, 1..120 characters.
 * Refused: `.` and `..` and any other leading dot (the cache directory itself,
 * its parent, a hidden file), `..` anywhere, the separators `/`, `\` and `:`,
 * and the control characters U+0000..U+001F and U+007F (T28 review, F50-01:
 * `.` passed and resolved to the cache directory, which the handler deleted).
 * The native handler checks it again before it touches the disk.
 */
export function isSafeFilename(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length >= 1 &&
    v.length <= 120 &&
    !v.startsWith('.') &&
    !v.includes('..') &&
    // eslint-disable-next-line no-control-regex
    !/[/\\:\u0000-\u001f\u007f]/.test(v)
  );
}

function onlyKeys(p: Record<string, unknown>, allowed: string[]): string | null {
  const extra = Object.keys(p).filter((k) => !allowed.includes(k));
  return extra.length ? `unknown field ${extra[0]}` : null;
}

/** Validate a request payload. Returns null when valid, or the detail of the `bad_payload` refusal. */
export function validateRequest(method: Method, payload: unknown): string | null {
  const p = payload === undefined ? {} : payload;
  if (!isObj(p)) return 'payload is not an object';
  switch (method) {
    case 'keepAwake':
      return onlyKeys(p, ['on']) ?? (typeof p.on === 'boolean' ? null : 'on must be a boolean');
    case 'haptics':
      return onlyKeys(p, ['style']) ?? ((HAPTIC_STYLES as readonly unknown[]).includes(p.style) ? null : 'unknown style');
    case 'share': {
      const e = onlyKeys(p, ['title', 'text', 'url']);
      if (e) return e;
      if (p.title !== undefined && !isStr(p.title, 200)) return 'title';
      if (p.text !== undefined && !isStr(p.text, 4000)) return 'text';
      if (p.url !== undefined && !isHttpsUrl(p.url)) return 'url must be https';
      return p.text === undefined && p.url === undefined ? 'text or url is required' : null;
    }
    case 'file.save': {
      const e = onlyKeys(p, ['url', 'filename', 'mime']);
      if (e) return e;
      if (!isHttpsUrl(p.url)) return 'url must be https';
      if (!isSafeFilename(p.filename)) return 'unsafe filename';
      if (p.mime !== undefined && !(isStr(p.mime, 100) && /^[\w.+-]+\/[\w.+-]+$/.test(p.mime))) return 'mime';
      return null;
    }
    case 'file.saveBytes': {
      const e = onlyKeys(p, ['transfer', 'seq', 'total', 'size', 'filename', 'mime', 'data']);
      if (e) return e;
      if (typeof p.transfer !== 'string' || !TRANSFER_ID.test(p.transfer)) return 'transfer';
      if (!isSafeFilename(p.filename)) return 'unsafe filename';
      if (p.mime !== undefined && !(isStr(p.mime, 100) && /^[\w.+-]+\/[\w.+-]+$/.test(p.mime))) return 'mime';
      const { seq, total, size, data } = p;
      if (!Number.isInteger(size) || (size as number) < 1 || (size as number) > MAX_SAVE_BYTES) return 'size';
      if (!Number.isInteger(total) || total !== Math.ceil((size as number) / SAVE_CHUNK_BYTES)) return 'total';
      if (!Number.isInteger(seq) || (seq as number) < 0 || (seq as number) >= (total as number)) return 'seq';
      if (typeof data !== 'string' || data.length === 0 || data.length > Math.ceil(SAVE_CHUNK_BYTES / 3) * 4) return 'data length';
      if (!BASE64_CANONICAL.test(data)) return 'data is not canonical base64';
      const last = (seq as number) === (total as number) - 1;
      const want = last ? (size as number) - ((total as number) - 1) * SAVE_CHUNK_BYTES : SAVE_CHUNK_BYTES;
      return base64DecodedLength(data) === want ? null : 'chunk length';
    }
    case 'link.open': {
      const e = onlyKeys(p, ['url']);
      if (e) return e;
      if (isHttpsUrl(p.url)) return null;
      if (isStr(p.url, 512) && /^(mailto|tel):[^\s]+$/i.test(p.url)) return null;
      return 'url must be https, mailto or tel';
    }
    case 'permission.state':
      return onlyKeys(p, ['kind']) ?? (p.kind === 'camera' || p.kind === 'microphone' ? null : 'kind');
    case 'lifecycle.canReload': {
      const e = onlyKeys(p, ['canReload', 'reason']);
      if (e) return e;
      if (typeof p.canReload !== 'boolean') return 'canReload must be a boolean';
      return p.reason === undefined || isStr(p.reason, 100) ? null : 'reason';
    }
    case 'shell.version':
      return onlyKeys(p, []);
    case 'auth.session': {
      if (p.signedOut !== undefined) return onlyKeys(p, ['signedOut']) ?? (p.signedOut === true ? null : 'signedOut must be true');
      const e = onlyKeys(p, ['accessToken', 'expiresAt']);
      if (e) return e;
      // The detail names the field, never the value: a refusal detail reaches the shell log.
      const claims = readTokenClaims(p.accessToken);
      if (!claims) return 'accessToken';
      if (!Number.isSafeInteger(p.expiresAt) || (p.expiresAt as number) <= 0) return 'expiresAt';
      // The web cannot give a token a longer life than its own `exp` claim.
      return (p.expiresAt as number) <= claims.exp * 1000 ? null : 'expiresAt is after the token exp';
    }
    case 'upload.start': {
      const e = onlyKeys(p, ['takeRef', 'filename', 'contentType']);
      if (e) return e;
      if (!(typeof p.takeRef === 'string' && TAKE_REF.test(p.takeRef))) return 'takeRef';
      if (!isSafeFilename(p.filename)) return 'unsafe filename';
      return (UPLOAD_CONTENT_TYPES as readonly unknown[]).includes(p.contentType) ? null : 'contentType';
    }
    case 'upload.status':
    case 'upload.cancel':
      return onlyKeys(p, ['jobId']) ?? (typeof p.jobId === 'string' && UPLOAD_JOB_ID.test(p.jobId) ? null : 'jobId');
    case 'capture.open': {
      const e = onlyKeys(p, ['mode', 'facing', 'projectId', 'slideId']);
      if (e) return e;
      if (p.mode !== 'webcam') return 'mode';
      if (!(CAPTURE_FACINGS as readonly unknown[]).includes(p.facing)) return 'facing';
      if (!(typeof p.projectId === 'string' && CAPTURE_SUBJECT_ID.test(p.projectId))) return 'projectId';
      return typeof p.slideId === 'string' && CAPTURE_SUBJECT_ID.test(p.slideId) ? null : 'slideId';
    }
    case 'capture.status':
    case 'capture.cancel':
      return onlyKeys(p, ['captureId']) ?? (typeof p.captureId === 'string' && CAPTURE_ID.test(p.captureId) ? null : 'captureId');
  }
}

// ---------------------------------------------------------------- versions

/** Compare two `x.y.z` versions. Returns null when one is not a version. */
export function compareVersions(a: string, b: string): number | null {
  const re = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;
  const ma = re.exec(String(a).trim());
  const mb = re.exec(String(b).trim());
  if (!ma || !mb) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
