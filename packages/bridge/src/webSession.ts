/**
 * Bridge v1.1 `auth.session`, the WEB side (plan 20261003-lesson-studio-native-later-phases,
 * R1; ADR-1 Option A). The web answers from its `AuthSession` (`createWebAuthSession` of
 * src/lib/ports, over supabase-js), which owns the session and its refresh.
 *
 * - It tells the shell each change: sign-in and refresh as `{ accessToken, expiresAt }`,
 *   sign-out as `{ signedOut: true }`.
 * - It answers each `ask` of the shell with the same call.
 * - It sends nothing when the shell does not offer `auth.session` (a browser tab, shell 0.3.0
 *   and older): those shells use no native session.
 *
 * The payload is built field by field from `accessToken` and `expiresAt`. Nothing else of the
 * session object, a refresh token included, can reach the bridge.
 */
import type { BridgeClient } from './client';
import type { AuthSessionReq } from './protocol';

/** The part of the `AuthSession` port of packages/core that the web side reads. */
export interface WebAuthSnapshotLike {
  readonly accessToken: string;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
}
export type WebAuthEventLike =
  | { readonly type: 'signed-in' | 'token-refreshed'; readonly session: WebAuthSnapshotLike }
  | { readonly type: 'signed-out' };
export interface WebAuthSessionLike {
  current(): WebAuthSnapshotLike | null;
  getAccessToken(options?: { minValidityMs?: number }): Promise<string | null>;
  refresh(): Promise<string | null>;
  subscribe(listener: (event: WebAuthEventLike) => void): () => void;
}

/** The ONLY function that builds an `auth.session` payload from a session. */
export function toSessionPayload(snapshot: WebAuthSnapshotLike | null): AuthSessionReq {
  if (!snapshot) return { signedOut: true };
  return { accessToken: String(snapshot.accessToken), expiresAt: Math.floor(Number(snapshot.expiresAt)) };
}

export interface ConnectedSession {
  /** Resolves when the handshake is done and the first state was sent (or not needed). */
  ready: Promise<boolean>;
  dispose(): void;
}

/**
 * Connect the web session to the shell. Returns at once; the work waits for the handshake.
 * `ready` resolves true when the shell offers `auth.session`, false otherwise.
 */
export function connectAuthSession(
  client: BridgeClient,
  auth: WebAuthSessionLike,
  onError?: (e: unknown) => void,
): ConnectedSession {
  let disposed = false;
  const cleanup: Array<() => void> = [];
  // One chain: the shell sees the changes in the order in which they happened.
  let chain: Promise<unknown> = Promise.resolve();
  const send = (payload: AuthSessionReq) => {
    chain = chain
      .then(() => (disposed ? undefined : client.call('auth.session', payload)))
      .catch((e: unknown) => onError?.(e));
    return chain;
  };

  const answer = async (forceRefresh: boolean) => {
    if (forceRefresh) await auth.refresh();
    else await auth.getAccessToken();
    const snapshot = auth.current();
    // A held session that the refresh could not renew: send nothing. The shell times out and
    // shows "sign in again"; an old token is never sent as if it were fresh.
    if (snapshot && snapshot.expiresAt <= Date.now()) return;
    await send(toSessionPayload(snapshot));
  };

  const ready = client.handshake().then(async () => {
    if (disposed || !client.has('auth.session')) return false;
    cleanup.push(
      auth.subscribe((event) => {
        void send(toSessionPayload(event.type === 'signed-out' ? null : event.session));
      }),
    );
    cleanup.push(client.onAsk('auth.session', ({ forceRefresh }) => answer(forceRefresh)));
    // The first state: the shell may have started before this page.
    await answer(false);
    return true;
  });

  return {
    ready,
    dispose() {
      disposed = true;
      for (const off of cleanup.splice(0)) off();
    },
  };
}
