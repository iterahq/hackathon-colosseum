/**
 * Bridge v1.1 `auth.session`, the SHELL side (plan 20261003-lesson-studio-native-later-phases,
 * R1; ADR-1 Option A). Pure TypeScript: no React Native, so the Node tests run it.
 *
 * The WebView owns the Supabase session and its refresh. The shell holds a COPY of the access
 * token, and nothing else:
 * - The web tells the shell when the session changes (sign-in, refresh, sign-out) with a call
 *   `auth.session`. `handler` is the native handler of that call.
 * - The shell asks for the session when it needs one (`getAccessToken`, `refresh`): it sends an
 *   `ask` through the router, and the web answers with the same call. With no answer in time,
 *   the result is null, and a native route shows "sign in again" (ADR-1 consequence).
 * - On EVERY `{ signedOut: true }` the copy is cleared and the listeners get `signed-out`, also
 *   when the shell held no copy (a launch where the page starts signed out). The iOS host
 *   connects `cancelUploadsOnSignOut` (packages/core) to `subscribe`, so each native upload stops.
 *   dfl-render verifies a JWT locally, so a sign-out does not revoke it there: the shell must.
 * - An expired token is never stored and never given to native code (`current`, `getAccessToken`).
 *
 * The object has the shape of the `AuthSession` port of packages/core (structural, so this
 * package keeps no dependency). R2 adds the Keychain copy (`createHandoffAuthSession`).
 */
import type { ShellHandler } from './shell';
import { type Req, readTokenClaims, validateRequest } from './protocol';

/** The same shape as `AuthSnapshot` of packages/core. */
export interface ShellAuthSnapshot {
  readonly userId: string;
  readonly accessToken: string;
  /** Epoch milliseconds: the earlier of the web `expiresAt` and the token `exp`. */
  readonly expiresAt: number;
}

export type ShellAuthEvent =
  | { readonly type: 'signed-in'; readonly session: ShellAuthSnapshot }
  | { readonly type: 'token-refreshed'; readonly session: ShellAuthSnapshot }
  | { readonly type: 'signed-out' };

export type ShellAuthListener = (event: ShellAuthEvent) => void;

/** Send an `ask` to the page. False when it could not be sent (no handshake, no WebView). */
export type SessionAsker = (forceRefresh: boolean) => boolean;

export interface ShellSessionOptions {
  now?: () => number;
  /** How long `getAccessToken` and `refresh` wait for the web to answer an ask. */
  askTimeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export interface ShellSession {
  /** The native handler of `auth.session`. */
  readonly handler: ShellHandler;
  /** The held copy, or null when there is none or it has expired. No network, no ask. */
  current(): ShellAuthSnapshot | null;
  /**
   * A token valid for at least `minValidityMs` (default 60 s). Asks the web when the copy is
   * absent or too old. Null when the web does not answer in time or the user is signed out.
   */
  getAccessToken(options?: { minValidityMs?: number }): Promise<string | null>;
  /** Ask the web to refresh, for example after a 401. Null with no answer. */
  refresh(): Promise<string | null>;
  subscribe(listener: ShellAuthListener): () => void;
  /** Connect the asker (the host: `router.ask` + `deliveryScript`). Returns the disconnect function. */
  bindAsk(ask: SessionAsker): () => void;
  /** The secrets to keep out of every other message and every log (`ShellRouterOptions.secrets`). */
  secrets(): readonly string[];
}

export const DEFAULT_MIN_VALIDITY_MS = 60_000;

interface Waiter {
  resolve: (token: string | null) => void;
  timer: unknown;
}

export function createShellSession(opts: ShellSessionOptions = {}): ShellSession {
  const now = opts.now ?? (() => Date.now());
  const askTimeoutMs = opts.askTimeoutMs ?? 5000;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const listeners = new Set<ShellAuthListener>();
  let held: ShellAuthSnapshot | null = null;
  let asker: SessionAsker | null = null;
  let waiters: Waiter[] = [];

  /** Read `held` through a call, so the compiler does not narrow it across an await. */
  const copy = (): ShellAuthSnapshot | null => held;
  const emit = (event: ShellAuthEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  const live = (s: ShellAuthSnapshot | null, minValidityMs = 0): s is ShellAuthSnapshot =>
    s !== null && s.expiresAt - now() > minValidityMs;

  const settle = (token: string | null) => {
    const list = waiters;
    waiters = [];
    for (const w of list) {
      clearTimer(w.timer);
      w.resolve(token);
    }
  };

  // Every `{ signedOut: true }` is told, also when no copy is held (T35 finding 1). A launch where
  // the page starts signed out (an expired session) holds no copy, but a background upload of the
  // earlier user can still run: the listeners (`cancelUploadsOnSignOut`) must cancel it.
  const signOut = () => {
    held = null;
    emit({ type: 'signed-out' });
    settle(null);
  };

  const handler: ShellHandler = (payload) => {
    // The router validated it; check again, this handler is also the native entry.
    const bad = validateRequest('auth.session', payload);
    if (bad) throw new Error(`bad payload: ${bad}`);
    const p = payload as Req<'auth.session'>;
    if ('signedOut' in p) {
      signOut();
      return { stored: false };
    }
    const claims = readTokenClaims(p.accessToken);
    if (!claims) throw new Error('bad payload: accessToken');
    const next: ShellAuthSnapshot = {
      userId: claims.sub,
      accessToken: p.accessToken,
      expiresAt: Math.min(p.expiresAt, claims.exp * 1000),
    };
    // An expired token is refused and not stored. The held copy stays as it was.
    if (!live(next)) throw new Error('token expired');
    const previous = held;
    held = next;
    if (!previous || previous.userId !== next.userId) emit({ type: 'signed-in', session: next });
    else if (previous.accessToken !== next.accessToken) emit({ type: 'token-refreshed', session: next });
    settle(next.accessToken);
    return { stored: true };
  };

  /** Ask the web, and wait for the next `auth.session` call (or the timeout). */
  const askWeb = (forceRefresh: boolean): Promise<string | null> =>
    new Promise((resolve) => {
      if (!asker || !asker(forceRefresh)) return resolve(null);
      const w: Waiter = { resolve, timer: null };
      w.timer = setTimer(() => {
        waiters = waiters.filter((x) => x !== w);
        resolve(null);
      }, askTimeoutMs);
      waiters.push(w);
    });

  return {
    handler,
    current: () => (live(held) ? held : null),
    async getAccessToken(options) {
      const min = options?.minValidityMs ?? DEFAULT_MIN_VALIDITY_MS;
      if (live(held, min)) return held.accessToken;
      let token = await askWeb(false);
      // The web answered with a token that is too old for the asked validity: ask it to refresh.
      if (token !== null && !live(copy(), min)) token = await askWeb(true);
      const after = copy();
      return token !== null && live(after, min) ? after.accessToken : null;
    },
    async refresh() {
      const token = await askWeb(true);
      const after = copy();
      return token !== null && live(after) ? after.accessToken : null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bindAsk(ask) {
      asker = ask;
      return () => {
        if (asker === ask) asker = null;
      };
    },
    secrets: () => (held ? [held.accessToken] : []),
  };
}
