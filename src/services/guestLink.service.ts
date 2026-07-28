/**
 * Instructor side of the guest link (plan 20260728-itera-guest-link-aula-sincrona,
 * ADR-12): read/generate the session's guest code, and see who joined as a guest.
 *
 * ⚠️ CAPABILITY-PROBED ON PURPOSE. `class_sessions.guest_code` and
 * `itera.class_guests` land in migration **0026**, and the Itera project has NO
 * migration ledger — merging the migration PR applies NOTHING; a human runs
 * `db/scripts/apply-migrations.sh` afterwards. So every read here is its OWN
 * query that degrades to `{available:false}` on error, and `guest_code` is
 * deliberately NOT added to `liveClass.service.SELECT_COLS`: putting it there
 * would make EVERY session read 400 on a deploy that ships this UI before the
 * migration is applied, taking the whole live class down to add a button.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { generateGuestCode } from '@/utils/guestCode';

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * `available:false` means the guest-link schema is not applied yet (or is not
 * readable) — the UI hides/disables the affordance instead of showing a broken
 * button.
 */
export interface GuestCodeState {
  code: string | null;
  available: boolean;
}

const UNAVAILABLE: GuestCodeState = { code: null, available: false };

/** The session's current guest code, if the column exists and is readable. */
export async function getSessionGuestCode(sessionId: string): Promise<GuestCodeState> {
  if (!isSupabaseConfigured || !sessionId) return UNAVAILABLE;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .select('guest_code')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !data) return UNAVAILABLE;
  return { code: str((data as Row).guest_code) || null, available: true };
}

/**
 * The session's guest code, generating one on first use. The UPDATE is gated by
 * the EXISTING `class_sessions_update_staff` policy — an instructor of the
 * session's tenant can write it; nobody else can. Idempotent: a session that
 * already has a code keeps it (the link a professor already pasted somewhere
 * must not silently rotate under them).
 */
export async function ensureSessionGuestCode(sessionId: string): Promise<GuestCodeState> {
  const current = await getSessionGuestCode(sessionId);
  if (!current.available) return UNAVAILABLE;
  if (current.code) return current;

  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .update({ guest_code: generateGuestCode() })
    .eq('id', sessionId)
    .select('guest_code')
    .maybeSingle();
  if (error || !data) return UNAVAILABLE;
  return { code: str((data as Row).guest_code) || null, available: true };
}

/**
 * The guests of a session (ADR-12: "who is a guest" + the counter). Readable by
 * the session's instructors via `class_guests_select_instructor`, and by the
 * guest itself via `class_guests_select_self`. Empty array when the table isn't
 * there yet — a missing counter is a far smaller failure than a broken sidebar.
 */
export async function listSessionGuestUserIds(sessionId: string): Promise<string[]> {
  if (!isSupabaseConfigured || !sessionId) return [];
  const sb = getSupabase();
  const { data, error } = await sb.from('class_guests').select('user_id').eq('session_id', sessionId);
  if (error || !data) return [];
  return (data as Row[]).map((r) => str(r.user_id)).filter(Boolean);
}
