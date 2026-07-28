/**
 * Guest-link data layer (plan 20260728-itera-guest-link-aula-sincrona).
 *
 * Two calls, both against itera-api (`VITE_ITERA_API_BASE`) — NOT PostgREST:
 *
 *   1. `POST /v1/live/guest-session` — trades the short session code + a
 *      self-declared name/avatar for a REAL Supabase session (ADR-1). The server
 *      mints it with service-role and hands back `{access_token, refresh_token}`
 *      which we apply with `supabase.auth.setSession()`. From that moment the
 *      guest is a normal `authenticated` JWT with **ZERO memberships** (ADR-2/B5)
 *      — which is exactly the blast radius the plan's invariant asks for: it can
 *      read the live session row, join `class:<id>`, and write its own
 *      class_answers/class_attendance, and nothing else.
 *
 *   2. `GET /v1/live/guest/:code/content` — the ONE read the guest cannot do
 *      itself. `itera.programs/units/lessons/activities` are membership-scoped,
 *      so a membership-less JWT reads `[]` there BY CONSTRUCTION (no policy lets
 *      it in — we did not add one). itera-api serves the invited session's lesson
 *      server-side instead, scoped to that session.
 *
 * Nothing here weakens or touches an RLS policy.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { iteraApiBase } from '@/api/iteraApi';
import { mapActivity } from '@/services/programs.service';
import type { Activity, I18nText } from '@/types/content';

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const bag = (v: unknown): I18nText =>
  v && typeof v === 'object' ? (v as I18nText) : ({ pt: '', en: '' } as I18nText);

/** The guest identity + session this browser joined with. */
export interface GuestSession {
  /** The `/g/:code` code that minted it. */
  code: string;
  /** itera.class_sessions.id resolved server-side from the code. */
  sessionId: string;
  /** itera.users.id of the guest (already provisioned by the auth trigger). */
  iteraUserId: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * What itera-api serves a guest for the invited lesson.
 *
 * Note what is NOT here: `placement` (program slug / unit / ordinals), which the
 * artifact repository uses to build a lesson's git-shaped path. itera-api hands a
 * guest the ONE invited lesson without its surrounding hierarchy — they hold no
 * membership in that program and have no artifact repository to file anything
 * under. Consumers see it through `LessonContent`, where `placement` is optional,
 * so `data?.placement ?? {}` degrades honestly with no guest-specific branch.
 */
export interface GuestLessonContent {
  id: string;
  title: I18nText;
  activities: Activity[];
}

/** The guest surface is dormant unless itera-api is configured for this build. */
export function guestJoinConfigured(): boolean {
  return Boolean(iteraApiBase()) && isSupabaseConfigured;
}

/* ── local persistence ─────────────────────────────────────────────────────
 * supabase-js already persists the guest's JWT in localStorage, so a reload
 * keeps the session — but not WHICH class it belongs to. We remember that here,
 * keyed by code, so a refresh mid-class does not bounce the guest back to the
 * name gate (which would mint a SECOND guest user for the same person and split
 * them across two rows in the roster/podium).
 */
const STORE_PREFIX = 'itera.guest.';

export function readStoredGuestSession(code: string): GuestSession | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + code);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestSession>;
    if (!parsed?.sessionId || !parsed?.iteraUserId) return null;
    return {
      code,
      sessionId: parsed.sessionId,
      iteraUserId: parsed.iteraUserId,
      displayName: parsed.displayName ?? '',
      avatarUrl: parsed.avatarUrl ?? null,
    };
  } catch {
    return null;
  }
}

export function storeGuestSession(guest: GuestSession): void {
  try {
    localStorage.setItem(STORE_PREFIX + guest.code, JSON.stringify(guest));
  } catch {
    /* private mode / quota — the gate simply shows again on reload */
  }
}

export function clearStoredGuestSession(code: string): void {
  try {
    localStorage.removeItem(STORE_PREFIX + code);
  } catch {
    /* no-op */
  }
}

/**
 * The guest code this browser last joined with, if any.
 *
 * Used to send a guest who wandered onto an authenticated route back to THEIR
 * class instead of into the app shell. Scans the `itera.guest.*` keys rather
 * than taking a code from the URL, because the whole point is that we are on a
 * route that carries no code.
 */
export function findStoredGuestCode(): string | null {
  try {
    let newest: { code: string; sessionId: string } | null = null;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORE_PREFIX)) continue;
      const code = key.slice(STORE_PREFIX.length);
      const stored = readStoredGuestSession(code);
      if (stored) newest = { code, sessionId: stored.sessionId };
    }
    return newest?.code ?? null;
  } catch {
    return null;
  }
}

/**
 * True when this access token belongs to a link-invited guest.
 *
 * Reads the `app_metadata.is_guest` claim that itera-api stamps when it mints
 * the session. This is a ROUTING signal only — it decides which surface to show,
 * never what data is returned. Authorization stays where it belongs: the guest
 * has zero memberships, so RLS gives them nothing regardless of what this says.
 * A forged claim would therefore change only which of two screens a user sees.
 */
export function isGuestAccessToken(token: string | undefined | null): boolean {
  if (!token) return false;
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { app_metadata?: { is_guest?: unknown } };
    return claims?.app_metadata?.is_guest === true;
  } catch {
    return false;
  }
}

/* ── itera-api calls ──────────────────────────────────────────────────────── */

interface GuestSessionResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  itera_user_id?: string;
  session_id?: string;
  display_name?: string;
}

export class GuestJoinError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GuestJoinError';
    this.status = status;
  }
}

/**
 * Is this guest code still worth opening? Advisory ONLY.
 *
 * Lets `/g/:code` refuse a forwarded, dead link on ARRIVAL instead of after the
 * visitor has typed a name and picked an avatar. It is deliberately NOT the
 * authority: `POST /v1/live/guest-session` re-checks `status = 'live'` on every
 * join and is what actually keeps a dead link out. A `true` here that goes stale
 * a second later changes nothing — the join still fails with 404.
 *
 * Returns `true` when it cannot tell (network down, endpoint absent on an older
 * itera-api). Failing OPEN is right for an advisory check: the cost of a wrong
 * `true` is one wasted form submission, while a wrong `false` would lock a
 * legitimate guest out of a class that is running.
 */
export async function isGuestCodeActive(code: string): Promise<boolean> {
  const base = iteraApiBase();
  if (!base) return true;
  try {
    const res = await fetch(`${base}/v1/live/guest/${encodeURIComponent(code)}/status`);
    if (!res.ok) return true;
    const data = (await res.json()) as { active?: unknown };
    return data?.active !== false;
  } catch {
    return true;
  }
}

/**
 * Join a live class as a guest: exchange the code for a Supabase session and
 * APPLY it to this browser. Throws `GuestJoinError` on a dead/unknown code (the
 * code stops resolving the moment the class is no longer live — ADR-5).
 */
export async function createGuestSession(args: {
  code: string;
  name: string;
  avatarUrl?: string | null;
}): Promise<GuestSession> {
  const base = iteraApiBase();
  if (!base) throw new GuestJoinError('itera-api not configured (VITE_ITERA_API_BASE unset)', 0);
  if (!isSupabaseConfigured) throw new GuestJoinError('Supabase not configured', 0);

  const res = await fetch(`${base}/v1/live/guest-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: args.code,
      name: args.name,
      ...(args.avatarUrl ? { avatar_url: args.avatarUrl } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new GuestJoinError(txt || `guest-session failed (${res.status})`, res.status);
  }
  const data = (await res.json()) as GuestSessionResponse;
  if (!data.access_token || !data.refresh_token || !data.session_id) {
    throw new GuestJoinError('guest-session response missing token/session', 502);
  }

  const sb = getSupabase();
  const { error } = await sb.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) throw new GuestJoinError(error.message, 401);

  const guest: GuestSession = {
    code: args.code,
    sessionId: data.session_id,
    iteraUserId: data.itera_user_id ?? '',
    displayName: data.display_name ?? args.name,
    avatarUrl: args.avatarUrl ?? null,
  };
  storeGuestSession(guest);
  return guest;
}

/**
 * The invited session's lesson + activities, served by itera-api because the
 * guest's own JWT cannot read `itera.lessons` (membership-scoped, deliberately
 * left untouched). Same return shape as `getLessonWithActivities` so the live
 * page consumes it without knowing the difference.
 */
export async function getGuestLessonContent(code: string): Promise<GuestLessonContent> {
  const base = iteraApiBase();
  if (!base) throw new Error('itera-api not configured (VITE_ITERA_API_BASE unset)');
  const sb = getSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('guest session missing — cannot read class content');

  const res = await fetch(`${base}/v1/live/guest/${encodeURIComponent(code)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `guest content failed (${res.status})`);
  }
  const data = (await res.json()) as Row;
  const lesson = (data.lesson && typeof data.lesson === 'object' ? data.lesson : {}) as Row;

  // itera-api serves the rows straight out of Postgres, so they arrive in DB
  // (snake_case) shape and go through the SAME mapper the PostgREST path uses —
  // one mapping, no second dialect of Activity to drift.
  const activities: Activity[] = asRows(data.activities)
    .map((a) => mapActivity({ ...a, lesson_id: a.lesson_id ?? a.lessonId ?? lesson.id }))
    .sort((x, y) => x.ordinal - y.ordinal);

  return {
    id: str(lesson.id),
    title: bag(lesson.title_i18n ?? lesson.titleI18n),
    activities,
  };
}
