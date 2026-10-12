/** The talent board: the public read (`talent-board` GET) and the learner's own opt-in (`talent-board` POST). */
import { contactKinds, parseCompany } from '@/services/privacy.service';
import { callShop } from '@/services/shopTransport';
import { CONTACT_FIELDS, type CompanyAccess, type ContactField, type RevealedContact } from '@/types/privacy';
import type { TalentBoard, TalentCapability, TalentFilters, TalentLearner, TalentReason, TalentStatus } from '@/types/talent';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const toCapabilities = (v: unknown): TalentCapability[] =>
  rows(v).flatMap((r) => (text(r.key) && text(r.title) ? [{ key: String(r.key), title: String(r.title), ...('graded' in r ? { graded: text(r.graded) } : {}) }] : []));

export function parseLearner(v: unknown): TalentLearner | null {
  const r = row(v);
  const wallet = text(r.wallet);
  if (!wallet) return null;
  const avatar = row(r.avatar);
  return {
    wallet,
    name: text(r.name),
    avatar: text(avatar.thumb_url) ? { key: text(avatar.key) ?? '', title: text(avatar.title) ?? '', thumbUrl: String(avatar.thumb_url), rarity: text(avatar.rarity) ?? 'common' } : null,
    headline: text(r.headline),
    stampedDays: int(r.stamped_days),
    totalDays: int(r.total_days),
    certifications: int(r.certifications),
    capabilities: toCapabilities(r.capabilities),
    bountiesPaid: int(r.bounties_paid),
    bountiesPaidLamports: int(r.bounties_paid_lamports),
    lastStampAt: text(r.last_stamp_at),
    profileUrl: text(r.profile_url) ?? `/u/${wallet}`,
    teamTest: r.team_test === true,
    hasContact: r.has_contact === true,
  };
}

export function parseBoard(body: unknown): TalentBoard {
  const r = row(body);
  return {
    source: text(r.source) ?? 'recorded',
    readAt: text(r.read_at),
    totalListed: int(r.total_listed),
    capabilities: toCapabilities(r.capabilities),
    learners: rows(r.learners).flatMap((entry) => parseLearner(entry) ?? []),
  };
}

export function parseStatus(body: unknown): TalentStatus {
  const r = row(body);
  const listing = row(r.listing);
  const reason = r.reason === 'no_wallet' || r.reason === 'nothing_proven' ? (r.reason as TalentReason) : null;
  return {
    wallet: text(r.wallet),
    listed: r.listed === true,
    headline: text(listing.headline),
    mayList: r.may_list === true,
    reason,
    stampedDays: int(r.stamped_days),
    totalDays: int(r.total_days),
    publicProfile: typeof r.public_profile === 'boolean' ? r.public_profile : null,
    contactKinds: contactKinds(r.contact),
    companiesLooked: int(r.companies_looked),
    lastLookedAt: text(r.last_looked_at),
  };
}

export async function getTalentBoard(lang: string, filters: TalentFilters): Promise<TalentBoard> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const query = new URLSearchParams({ lang });
  if (filters.capability) query.set('capability', filters.capability);
  if (filters.minDays > 0) query.set('min_days', String(filters.minDays));
  const res = await fetch(`${url}/functions/v1/talent-board?${query}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (!res.ok) throw new Error(`talent-board failed (${res.status})`);
  return parseBoard(await res.json());
}

const post = (body: Record<string, unknown>) => callShop('talent-board', { body });

export async function getTalentStatus(): Promise<TalentStatus> {
  return parseStatus((await post({ action: 'status' })).data);
}

/** `contact` holds only the fields the learner filled. It goes in the request body and is kept nowhere in the app. */
export async function listMeForTalent(headline: string, contact?: Partial<Record<ContactField, string>>): Promise<TalentStatus> {
  return parseStatus((await post({ action: 'list', headline: headline.trim(), ...(contact && Object.keys(contact).length > 0 ? { contact } : {}) })).data);
}

/** Whether the signed-in account may ask for contacts. Any failure reads as "not a company". */
export async function getCompanyAccess(): Promise<CompanyAccess> {
  try {
    return parseCompany((await post({ action: 'company' })).data);
  } catch {
    return parseCompany(null);
  }
}

export function parseReveal(body: unknown): { contact: RevealedContact; revealsLeftToday: number } {
  const r = row(body);
  const wire = row(r.contact);
  const contact: RevealedContact = {};
  for (const field of CONTACT_FIELDS) if (typeof wire[field] === 'string' && wire[field] !== '') contact[field] = wire[field] as string;
  return { contact, revealsLeftToday: int(r.reveals_left_today) };
}

/**
 * A company asks to see the contact of one listed learner. The server checks who is asking, records the look and
 * counts it against the day. The answer is handed to the caller and stored nowhere: no cache, no log, no storage.
 */
export async function revealContact(wallet: string): Promise<{ contact: RevealedContact; revealsLeftToday: number }> {
  return parseReveal((await post({ action: 'reveal_contact', wallet })).data);
}

export async function unlistMeFromTalent(): Promise<TalentStatus> {
  return parseStatus((await post({ action: 'unlist' })).data);
}
