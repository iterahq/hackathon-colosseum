/**
 * The learner's own privacy choices (`privacy` edge function): whether the profile page is shown to others, and what
 * the talent listing holds. A contact VALUE is never kept: this file reads only WHICH contacts exist.
 */
import { ShopCallError } from '@/services/shopTransport';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { CONTACT_FIELDS, type CompanyAccess, type ContactField, type Privacy } from '@/types/privacy';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Which contacts a block holds. The values are dropped here, on purpose. */
export function contactKinds(v: unknown): ContactField[] {
  const r = row(v);
  return CONTACT_FIELDS.filter((field) => typeof r[field] === 'string' && r[field] !== '');
}

export function parseCompany(v: unknown): CompanyAccess {
  const r = row(v);
  return { isCompany: r.is_company === true, via: r.via === 'funded_bounty' || r.via === 'tenant_staff' ? r.via : null, revealsLeftToday: int(r.reveals_left_today), revealsPerDay: int(r.reveals_per_day) };
}

/** Null when the answer does not say whether the profile is public: the caller then draws no switch. */
export function parsePrivacy(body: unknown): Privacy | null {
  const r = row(body);
  if (typeof r.public_profile !== 'boolean') return null;
  const talent = row(r.talent);
  return {
    wallet: text(r.wallet),
    publicProfile: r.public_profile,
    source: r.public_profile_source === 'existing_account' || r.public_profile_source === 'new_account' ? r.public_profile_source : 'chosen',
    talentListed: talent.listed === true,
    contactKinds: contactKinds(talent.contact),
    companiesLooked: int(talent.companies_looked),
    lastLookedAt: text(talent.last_looked_at),
    company: parseCompany(r.company),
  };
}

async function call(method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<unknown> {
  if (!isSupabaseConfigured) throw new ShopCallError('Supabase not configured.', null);
  const { data, error } = await getSupabase().functions.invoke('privacy', method === 'GET' ? { method } : { method, body });
  if (!error) return data;
  const context = (error as { context?: Response }).context;
  let code: string | null = null;
  try {
    code = text(row(await context?.clone().json()).error);
  } catch {
    /* no JSON body */
  }
  throw new ShopCallError(code ?? error.message, typeof context?.status === 'number' ? context.status : null, code);
}

/** Null when the function is missing or the learner is not signed in: no switch is drawn. */
export async function getPrivacy(): Promise<Privacy | null> {
  try {
    return parsePrivacy(await call('GET'));
  } catch {
    return null;
  }
}

/**
 * Shows or hides the profile page. Hiding it while listed on the talent board is refused (`listed_on_talent_board`)
 * unless `leaveBoard` says the learner agreed to leave the board, which deletes the contact.
 */
export async function setProfilePublic(isPublic: boolean, leaveBoard = false): Promise<Privacy> {
  const parsed = parsePrivacy(await call('POST', { action: 'set_profile', public: isPublic, ...(leaveBoard ? { leave_board: true } : {}) }));
  if (!parsed) throw new ShopCallError('privacy: unreadable answer', null);
  return parsed;
}
