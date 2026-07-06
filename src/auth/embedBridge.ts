/**
 * Embed bridge — federated session bootstrap (NO re-login) when itera-player is
 * rendered inside the dfl-learn `/itera` mini-app iframe.
 *
 * Federation mechanism (plan #7 — 20260619-itera-fellowship-e2e-integration):
 *   1. dfl-learn's <DflRemote> iframe host posts `{type:'DFL_SET_TOKEN', token, userId}`
 *      to this iframe AFTER we emit `DFL_READY`. The token is the DFL Supabase
 *      access_token of the signed-in fellow.
 *   2. We POST it to itera-api `POST /v1/embed/session` body `{dfl_token}`.
 *      itera-api verifies the DFL JWT against the DFL JWKS (ES256), finds/creates
 *      an Itera Supabase auth user (email = DFL email), repairs the
 *      itera.users/identities/memberships rows, and mints an ITERA session.
 *   3. We call `supabase.auth.setSession({access_token, refresh_token})` →
 *      AuthProvider's onAuthStateChange fires → the fellow is authed in Itera
 *      with NO re-login, RLS-scoped to the dfl-batch tenant.
 *
 * ADR-4: no cross-Supabase FK. The DFL uid is opaque; the RLS-resolving
 * identity row keys provider_subject on the ITERA auth uid (server-side).
 *
 * When the URL does NOT carry `?embed=1`, none of this runs and behavior is
 * unchanged (standalone SPA login).
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

/** Pilot lesson the embedded fellow is routed to so the activity renders. */
export const PILOT_LESSON_ID = '57c1736a-787b-4619-80f2-e7d00200b0b3';

/** itera-api base URL — overridable at build time; defaults to prod. */
const ITERA_API_URL =
  (import.meta.env.VITE_ITERA_API_URL as string | undefined) || 'https://api.iterahq.dev';

/**
 * Parent origins allowed to hand us a DFL token. We MUST verify `event.origin`
 * before trusting a `DFL_SET_TOKEN` message — otherwise any page that frames us
 * could inject a session.
 */
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/learn\.devfellowship\.com$/,
  /^https:\/\/([a-z0-9-]+\.)*devfellowship\.com$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

/** Exported for tests — true when `origin` may hand us a DFL token. */
export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

/** True when the app is running in embed mode (`?embed=1`). */
export function isEmbedMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch {
    return false;
  }
}

interface DflSetTokenMessage {
  type: 'DFL_SET_TOKEN';
  token: string;
  userId?: string;
}

interface EmbedSessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  itera_user_id?: string;
}

/** Post a typed message to the parent frame (best-effort; no-op if not framed). */
function postToParent(message: unknown): void {
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  } catch {
    /* cross-origin parent — ignore */
  }
}

/** Notify the dfl-learn host we're ready to receive a token. */
export function postReady(): void {
  postToParent({ type: 'DFL_READY' });
}

/** Optional UX niceties for the DFL mini-app host (resize / navigate). */
export function postResize(height: number): void {
  postToParent({ type: 'DFL_RESIZE', height });
}
export function postNavigate(path: string): void {
  postToParent({ type: 'DFL_NAVIGATE', path });
}

/**
 * Exchange a DFL access token for an Itera session via itera-api, then set it on
 * the Supabase client so the AuthProvider picks it up. Returns true on success.
 */
export async function exchangeDflToken(dflToken: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  let res: Response;
  try {
    res = await fetch(`${ITERA_API_URL}/v1/embed/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dfl_token: dflToken }),
    });
  } catch (err) {
    console.warn('[itera/embed] token exchange request failed:', err);
    return false;
  }
  if (!res.ok) {
    // 401 = bad/expired DFL token; the host should re-send a fresh one.
    console.warn(`[itera/embed] /v1/embed/session returned ${res.status}`);
    return false;
  }
  let body: EmbedSessionResponse;
  try {
    body = (await res.json()) as EmbedSessionResponse;
  } catch {
    console.warn('[itera/embed] could not parse /v1/embed/session response');
    return false;
  }
  if (!body.access_token || !body.refresh_token) {
    console.warn('[itera/embed] /v1/embed/session missing tokens');
    return false;
  }
  const { error } = await getSupabase().auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) {
    console.warn('[itera/embed] setSession failed:', error.message);
    return false;
  }
  // Mark this browser session as DFL-federated so the entitlement gate passes (D2).
  // AuthContext reads this flag via isDflFederated; it's cleared on signOut.
  try { localStorage.setItem('itera_dfl_session', '1'); } catch { /* storage blocked */ }
  return true;
}

/**
 * Install the embed bridge. Idempotent-safe to call once at app mount.
 * - Emits DFL_READY so the host posts the token.
 * - Listens for `DFL_SET_TOKEN` from an allowed origin and exchanges it.
 *
 * `onAuthed` fires (at most once) after a successful session set, so the caller
 * can route the fellow to the pilot lesson.
 *
 * Returns a teardown function (removes the listener).
 */
export function installEmbedBridge(onAuthed?: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let authed = false;

  const handler = (event: MessageEvent) => {
    if (!isAllowedOrigin(event.origin)) return;
    const data = event.data as Partial<DflSetTokenMessage> | undefined;
    if (!data || data.type !== 'DFL_SET_TOKEN' || typeof data.token !== 'string') return;
    void exchangeDflToken(data.token).then((ok) => {
      if (ok && !authed) {
        authed = true;
        onAuthed?.();
      }
    });
  };

  window.addEventListener('message', handler);
  // Announce readiness AFTER the listener is attached so we never miss the reply.
  postReady();

  return () => window.removeEventListener('message', handler);
}
