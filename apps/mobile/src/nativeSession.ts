/**
 * Provenance: devfellowship/dfl-lesson-studio, apps/ios/src/nativeSession.ts, commit
 * c90ad44cd6e55d37d337bb26ede17e96a10c51f1 (derived, not a copy; PLAN ADR-10, row R-12).
 * Kept: one session object for the app process over `createShellSession` of the bridge package, and the
 * asker that goes through the router.
 * Removed: `attachUploadTransport` (this shell has no native upload).
 * Added: the claims gate (`tokenShapeProblem`), the owner of the held copy (`release`), `sessionLine`.
 *
 * What native code holds (ADR-10): a COPY of the access token, its expiry and the user id read from
 * `sub`. In memory only: no SecureStore, no AsyncStorage, no file. The WebView owns the Supabase
 * session and its refresh; the refresh token never crosses the bridge (the schema of `auth.session`
 * has no field for it). The copy ends on `{signedOut: true}`, when another user signs in (replaced),
 * when the WebView that delivered it starts a top-frame load, is relaunched or unmounts (`release`),
 * when the app returns to the foreground and no page vouches for it within a short grace (`revalidate`),
 * and with the process. After its `exp` it is never given out: `getAccessToken` asks the page for a
 * fresh one instead (the shell never refreshes by itself), and answers null when the page does not.
 *
 * A build that names no backend (`EXPO_PUBLIC_SUPABASE_URL` unset or malformed) has NO native session:
 * the host creates none, `auth.session` is not registered, and the page is never offered it. There is
 * no build in which the issuer of a token goes unchecked.
 *
 * The claims gate checks SHAPE only. The shell has no key to verify a signature with, and must not
 * have one; the backend verifies the token on every request.
 *
 * Pure TypeScript: no React Native import.
 */
import {
  type SessionAsker,
  type ShellHandler,
  type ShellSession,
  type ShellSessionOptions,
  base64DecodedLength,
  createShellSession,
  decodeBase64Into,
  readTokenClaims,
} from '@iterahq/shell-bridge';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIENCE = 'authenticated';

/** The issuer of the Supabase project at `supabaseOrigin`. */
export const issuerOf = (supabaseOrigin: string): string => `${supabaseOrigin}/auth/v1`;

/**
 * The payload of a JWT as an object, or null. The bytes are read one character each: a name with an
 * accent comes out wrong, but the JSON structure and every ASCII claim are exact, and only ASCII claims
 * are compared below.
 */
function payloadOf(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1] ?? '';
  if (part === '' || part.length % 4 === 1) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  try {
    const bytes = new Uint8Array(base64DecodedLength(b64));
    decodeBase64Into(b64, bytes, 0);
    let text = '';
    for (const b of bytes) text += String.fromCharCode(b);
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Why this token is not one the shell holds, as the NAME of the failing part (never a value), or null.
 * `issuer` is the issuer of the project this shell was built for.
 */
export function tokenShapeProblem(token: unknown, issuer: string): string | null {
  const base = readTokenClaims(token);
  if (base === null || typeof token !== 'string') return 'accessToken';
  if (!UUID.test(base.sub)) return 'sub';
  const claims = payloadOf(token);
  if (claims === null) return 'accessToken';
  const aud = claims.aud;
  if (aud !== AUDIENCE && !(Array.isArray(aud) && aud.includes(AUDIENCE))) return 'aud';
  if (issuer === '' || claims.iss !== issuer) return 'iss';
  const app = claims.app_metadata;
  // A link-invited guest of a live class (`/g/:code`) has no native screen; the web never sends its token.
  if (typeof app === 'object' && app !== null && (app as Record<string, unknown>).is_guest === true) return 'guest';
  return null;
}

export interface NativeSessionOptions extends ShellSessionOptions {
  /** The issuer the token must name (`issuerOf(EXPO_PUBLIC_SUPABASE_URL)`). */
  issuer: string;
  /** How long `revalidate` waits for the page to answer before it drops the copy. */
  graceMs?: number;
}

export const REVALIDATE_GRACE_MS = 5000;

export interface NativeSession {
  /** The held copy: `getAccessToken`, `subscribe`, `secrets`, `current`. Bind the asker with `bindAsk` below. */
  readonly session: ShellSession;
  /** Connect the asker of one mounted WebView (the last one bound is the one asked). Returns the disconnect function. */
  bindAsk(ask: SessionAsker): () => void;
  /**
   * The app came back to the foreground: a sign-out may have been lost while it was suspended. Ask the
   * page once; when it does not push its state (a token or `signedOut`) within the grace, drop the copy.
   * With no copy it does nothing; with no page to ask it drops at once. One timer per call, none otherwise.
   */
  revalidate(): void;
  /** The `auth.session` handler of one mounted WebView. */
  handlerFor(owner: string): ShellHandler;
  /** Drop the copy when this WebView delivered it. The listeners get `signed-out`. */
  release(owner: string): void;
}

export function createNativeSession({ issuer, graceMs = REVALIDATE_GRACE_MS, ...options }: NativeSessionOptions): NativeSession {
  const session = createShellSession(options);
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  let deliveredBy: string | null = null;
  let asker: SessionAsker | null = null;
  let pushes = 0;
  const drop = () => {
    deliveredBy = null;
    void session.handler({ signedOut: true });
  };
  return {
    session,
    bindAsk(ask) {
      asker = ask;
      const unbind = session.bindAsk(ask);
      return () => {
        if (asker === ask) asker = null;
        unbind();
      };
    },
    revalidate() {
      if (session.current() === null) return;
      const seen = pushes;
      if (asker === null || !asker(false)) return drop();
      setTimer(() => {
        if (pushes === seen) drop();
      }, graceMs);
    },
    handlerFor: (owner) => (payload) => {
      const token = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).accessToken : undefined;
      if (token === undefined) {
        const result = session.handler(payload);
        deliveredBy = null;
        pushes += 1;
        return result;
      }
      const problem = tokenShapeProblem(token, issuer);
      if (problem !== null) throw new Error(`bad payload: ${problem}`);
      const result = session.handler(payload);
      deliveredBy = owner;
      pushes += 1;
      return result;
    },
    release(owner) {
      if (deliveredBy === owner) drop();
    },
  };
}

/** The dev overlay line: whether a copy is held and for how long. Never the token, never the user. */
export function sessionLine(snapshot: { expiresAt: number } | null, now: number): string {
  if (snapshot === null) return 'Sessão: não';
  return `Sessão: sim (expira em ${Math.max(0, Math.floor((snapshot.expiresAt - now) / 60_000))} min)`;
}
