/**
 * Durable live-class records (migration 0020): the learner's own answers
 * (right AND wrong) + attendance, and the instructor's post-class report read.
 *
 * Writes are BEST-EFFORT — a failed record never blocks the live experience
 * (the broadcast fast-path stays the source of the in-class UI). Aggregation
 * happens in TS (utils/buildClassReport), not in the DB.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → fetch. No React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import type { ClassReportData, ClassReportUser } from '@/types/liveClass';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Record that the signed-in learner joined the session (first join wins). */
export async function recordClassAttendance(sessionId: string): Promise<void> {
  if (!isSupabaseConfigured || !sessionId) return;
  try {
    const userId = await getIteraUserId();
    if (!userId) return;
    await getSupabase()
      .from('class_attendance')
      .upsert(
        { session_id: sessionId, user_id: userId },
        { onConflict: 'session_id,user_id', ignoreDuplicates: true }
      );
  } catch {
    // best-effort
  }
}

/** Record the learner's own answer for one activity (latest attempt wins). */
export async function recordClassAnswer(
  sessionId: string,
  activityId: string,
  correct: boolean,
  elapsedMs?: number
): Promise<void> {
  if (!isSupabaseConfigured || !sessionId || !activityId) return;
  try {
    const userId = await getIteraUserId();
    if (!userId) return;
    await getSupabase()
      .from('class_answers')
      .upsert(
        {
          session_id: sessionId,
          activity_id: activityId,
          user_id: userId,
          correct,
          elapsed_ms: typeof elapsedMs === 'number' ? Math.max(0, Math.round(elapsedMs)) : null,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,activity_id,user_id' }
      );
  } catch {
    // best-effort
  }
}

/**
 * The raw report rows for one session. RLS scopes reads: the instructor of the
 * session's tenant sees everyone; a learner would only see their own rows.
 */
export async function getClassReportData(sessionId: string): Promise<ClassReportData> {
  if (!isSupabaseConfigured || !sessionId)
    return { answers: [], attendance: [], users: [], guestUserIds: [] };
  const sb = getSupabase();
  const [{ data: ans }, { data: att }, guests] = await Promise.all([
    sb
      .from('class_answers')
      .select('activity_id, user_id, correct, elapsed_ms, created_at')
      .eq('session_id', sessionId),
    sb.from('class_attendance').select('user_id, joined_at').eq('session_id', sessionId),
    // Who in this session was a link-invited guest. Its own query, degrading to
    // [] — `class_guests` arrives in migration 0026 and the Itera project has no
    // migration ledger, so a deploy can legitimately run ahead of the schema.
    // Failing open here would silently fold guests back into the cohort totals,
    // so the caller treats [] as "no guests known" and says so.
    (async () => {
      const { data, error } = await sb
        .from('class_guests')
        .select('user_id, display_name')
        .eq('session_id', sessionId);
      return { data, error };
    })(),
  ]);

  const answers = asRows(ans).map((r) => ({
    activityId: str(r.activity_id),
    userId: str(r.user_id),
    correct: r.correct === true,
    elapsedMs: typeof r.elapsed_ms === 'number' ? r.elapsed_ms : null,
    createdAt: str(r.created_at),
  }));
  const attendance = asRows(att).map((r) => ({
    userId: str(r.user_id),
    joinedAt: str(r.joined_at),
  }));

  // A guest has NO membership, so `users_select_admin` (which reaches learners
  // through the tenant's membership rows) does not resolve them: measured on a
  // real session, the instructor could read 2 attendance rows and 0 of the
  // matching `itera.users` rows. Without the name from `class_guests` a guest
  // would show up in the report as an anonymous participant — counted, unnamed.
  const guestRows = asRows(guests.data);
  const guestUserIds = guestRows.map((g) => str(g.user_id)).filter(Boolean);
  const guestNames = new Map(
    guestRows.map((g) => [str(g.user_id), str(g.display_name)] as const).filter(([id]) => id)
  );

  const ids = [...new Set([...answers.map((a) => a.userId), ...attendance.map((a) => a.userId)])].filter(
    Boolean
  );
  let users: ClassReportUser[] = [];
  if (ids.length > 0) {
    const { data } = await sb.from('users').select('id, display_name, email, avatar_url').in('id', ids);
    users = asRows(data).map((u) => ({
      userId: str(u.id),
      name: str(u.display_name) || str(u.email) || str(u.id).slice(0, 8),
      avatarUrl: strOrNull(u.avatar_url),
    }));
  }

  // Fill in the guests the `users` read could not reach, so the professor sees
  // "Ana (convidado)" instead of a nameless row (ADR-12: he must be able to tell
  // who was a guest).
  const known = new Set(users.map((u) => u.userId));
  for (const [userId, name] of guestNames) {
    if (!known.has(userId) && ids.includes(userId)) {
      users.push({ userId, name: name || userId.slice(0, 8), avatarUrl: null });
    }
  }

  return { answers, attendance, users, guestUserIds };
}
