import { useEffect } from 'react';
import {
  DEFAULT_MIN_VALIDITY_MS,
  connectAuthSession,
  type BridgeClient,
  type ConnectedSession,
  type Method,
  type Req,
  type Res,
  type WebAuthEventLike,
  type WebAuthSnapshotLike,
} from '@iterahq/shell-bridge';
import { useAuth } from '@/auth/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { isGuestAccessToken } from '@/services/guestSession.service';
import type { ShellSessionAuth, ShellSessionHeld, ShellSessionInput, ShellSessionSource } from '@/types/shellSession';
import { startShellBridge } from './shellBridge';

/**
 * What the shell may know of a session: the access token and its expiry, read field by field. A
 * link-invited guest of a live class (`/g/:code`) counts as signed out: that surface stays in the
 * WebView, so no native screen needs its token.
 */
export function toShellSnapshot(session: ShellSessionInput | null): ShellSessionHeld | null {
  if (!session?.access_token || !session.user?.id || typeof session.expires_at !== 'number') return null;
  if (isGuestAccessToken(session.access_token)) return null;
  return { userId: session.user.id, snapshot: { accessToken: session.access_token, expiresAt: session.expires_at * 1000 } };
}

export function createShellSessionSource(auth: () => ShellSessionAuth, now: () => number = () => Date.now()): ShellSessionSource {
  let held: ShellSessionHeld | null = null;
  const listeners = new Set<(event: WebAuthEventLike) => void>();
  const emit = (event: WebAuthEventLike) => {
    for (const listener of [...listeners]) listener(event);
  };
  // Reads made to answer the shell are silent: the answer itself carries the state.
  const hold = (session: ShellSessionInput | null): WebAuthSnapshotLike | null => {
    held = toShellSnapshot(session);
    return held?.snapshot ?? null;
  };
  const fresh = (snapshot: WebAuthSnapshotLike | null, min: number): snapshot is WebAuthSnapshotLike =>
    snapshot !== null && snapshot.expiresAt - now() > min;
  const refresh = async (): Promise<string | null> => {
    const { data, error } = await auth().refreshSession();
    if (error || !data.session) return null;
    return hold(data.session)?.accessToken ?? null;
  };
  return {
    take(session) {
      const previous = held;
      const next = toShellSnapshot(session);
      held = next;
      if (!next) {
        if (previous) emit({ type: 'signed-out' });
      } else if (!previous || previous.userId !== next.userId) emit({ type: 'signed-in', session: next.snapshot });
      else if (previous.snapshot.accessToken !== next.snapshot.accessToken) emit({ type: 'token-refreshed', session: next.snapshot });
    },
    current: () => held?.snapshot ?? null,
    async getAccessToken(options) {
      const min = options?.minValidityMs ?? DEFAULT_MIN_VALIDITY_MS;
      const { data } = await auth().getSession();
      const snapshot = hold(data.session);
      if (fresh(snapshot, min)) return snapshot.accessToken;
      return snapshot === null ? null : refresh();
    },
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The waits before the second and the third try of a sign-out the shell did not acknowledge. */
export const SIGN_OUT_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

/**
 * Sign-out is the event that ends the shell's copy of the token, so it is not sent once and forgotten:
 * a `{signedOut: true}` that times out (the shell dropped the message, or the app was suspended) is sent
 * again, three tries in all. Only that payload and only a timeout: a refusal is an answer, and a token
 * push that fails is replaced by the next refresh. The bridge sends in order, so a sign-in that follows
 * waits behind the retries and can never be undone by one.
 */
export function withSignOutRetry(
  client: BridgeClient,
  delays: readonly number[] = SIGN_OUT_RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): BridgeClient {
  async function call<M extends Method>(method: M, payload: Req<M>): Promise<Res<M>> {
    const signOut = method === 'auth.session' && typeof payload === 'object' && payload !== null && 'signedOut' in payload;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await client.call(method, payload);
      } catch (error) {
        const lost = typeof error === 'object' && error !== null && (error as { reason?: unknown }).reason === 'timeout';
        if (!signOut || !lost || attempt >= delays.length) throw error;
        await wait(delays[attempt]);
      }
    }
  }
  return { ...client, call };
}

let source: ShellSessionSource | null = null;
const sessionSource = (): ShellSessionSource => (source ??= createShellSessionSource(() => getSupabase().auth));

/**
 * The one call site of `auth.session` (PLAN ADR-10, row R-12), mounted once beside `ShellBridgeMount`
 * and driven by the auth state the app already holds (`useAuth`): no second auth subscription, no
 * per-page copy. Direction is web to shell only. The payload is built by the bridge package from two
 * fields, `{accessToken, expiresAt}`, or is `{signedOut: true}`; the refresh token, the provider tokens
 * and the user object never leave this page, and the shell never refreshes: when its copy runs out it
 * asks, and this page answers from supabase-js.
 *
 * Sent after the handshake (a session that already exists), on sign-in, on each token refresh, on a
 * change of user, and as `{signedOut: true}` on sign-out (retried when not acknowledged). In a browser tab the handshake settles at
 * `no_shell` and nothing is sent; a shell that does not list `auth.session` is told nothing either.
 */
export function ShellAuthSessionMount(): null {
  const { session, loading, configured } = useAuth();
  useEffect(() => {
    if (!configured || !isSupabaseConfigured) return undefined;
    let connected: ConnectedSession | null = null;
    try {
      const client = startShellBridge();
      if (client) connected = connectAuthSession(withSignOutRetry(client), sessionSource());
    } catch {
      // the bridge must never break the page
    }
    return () => connected?.dispose();
  }, [configured]);
  useEffect(() => {
    if (loading || !configured || !isSupabaseConfigured) return;
    try {
      sessionSource().take(session);
    } catch {
      // the bridge must never break the page
    }
  }, [session, loading, configured]);
  return null;
}
