import { bearerToken } from './http.ts';
import { resolveCaller, type Caller } from './caller.ts';
import type { IteraClient } from './db.ts';
import { unverifiedSubject } from './jwt-subject.ts';
import {
  CONTACT_FIELDS,
  REVEAL_WINDOW_MS,
  companyVia,
  contactOf,
  profileVisibility,
  revealsLeft,
  walletIsPublic,
  REVEALS_PER_DAY,
  type CompanyVia,
  type Contact,
  type ProfileFacts,
  type ProfileSource,
} from './privacy.ts';
import { staffTenantIds } from './staff.ts';
import { loadMemberships } from './staff-store.ts';

/** `onchain_config.profile_private_from`: accounts created from this moment on are private until they choose. */
export const PROFILE_CUTOFF_KEY = 'profile_private_from';
const CONTACT_COLUMNS = CONTACT_FIELDS.join(',');

async function cutoff(db: IteraClient): Promise<string | null> {
  const { data, error } = await db.from('onchain_config').select('value').eq('key', PROFILE_CUTOFF_KEY).maybeSingle();
  if (error) throw new Error(`onchain_config: ${error.message}`);
  return (data?.value as string | undefined) ?? null;
}

/** What decides the visibility of these accounts: their choice, when they were created, the cutoff. */
async function factsOf(db: IteraClient, userIds: string[]): Promise<Map<string, ProfileFacts>> {
  const facts = new Map<string, ProfileFacts>();
  if (userIds.length === 0) return facts;
  const [settings, users, from] = await Promise.all([
    db.from('profile_settings').select('user_id,public_profile').in('user_id', userIds),
    db.from('users').select('id,created_at').in('id', userIds),
    cutoff(db),
  ]);
  if (settings.error) throw new Error(`profile_settings: ${settings.error.message}`);
  if (users.error) throw new Error(`users: ${users.error.message}`);
  const chosen = new Map(((settings.data ?? []) as Array<{ user_id: string; public_profile: boolean }>).map((row) => [row.user_id, row.public_profile]));
  for (const row of (users.data ?? []) as Array<{ id: string; created_at: string }>) {
    facts.set(row.id, { chosen: chosen.get(row.id) ?? null, createdAt: row.created_at, cutoff: from });
  }
  // An id with no user row cannot be shown to be old: it reads as a new account.
  for (const id of userIds) if (!facts.has(id)) facts.set(id, { chosen: chosen.get(id) ?? null, createdAt: null, cutoff: from });
  return facts;
}

export async function profileOf(db: IteraClient, userId: string): Promise<{ public: boolean; source: ProfileSource }> {
  return profileVisibility((await factsOf(db, [userId])).get(userId) as ProfileFacts);
}

/** The accounts whose public profile is on, among these. One read for a whole board. */
export async function publicAccounts(db: IteraClient, userIds: string[]): Promise<Set<string>> {
  const facts = await factsOf(db, [...new Set(userIds)]);
  return new Set([...facts].filter(([, entry]) => profileVisibility(entry).public).map(([id]) => id));
}

/** Every account our tables tie to a wallet: the ones it signed in as, was linked to, or holds assets of. */
async function accountsOfWallet(db: IteraClient, wallet: string): Promise<string[]> {
  const [linked, achievements, companions, avatars, listings] = await Promise.all([
    db.from('user_wallets').select('user_id').eq('wallet', wallet).limit(5),
    db.from('user_achievements').select('user_id').eq('wallet_address', wallet).limit(5),
    db.from('companions').select('user_id').eq('wallet_address', wallet).limit(5),
    db.from('avatar_assets').select('user_id').eq('wallet', wallet).limit(5),
    db.from('talent_listings').select('user_id').eq('wallet', wallet).limit(5),
  ]);
  const ids = new Set<string>();
  for (const [label, result] of Object.entries({ user_wallets: linked, user_achievements: achievements, companions, avatar_assets: avatars, talent_listings: listings })) {
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    for (const row of (result.data ?? []) as Array<{ user_id: string }>) ids.add(row.user_id);
  }
  return [...ids];
}

export interface WalletView {
  /** The page of this wallet is shown to others. */
  public: boolean;
  /** The request carries the session of the wallet's own owner. */
  owner: boolean;
  /** The full answer may be given: a public wallet, or its owner asking. */
  visible: boolean;
}

/**
 * Whether the aggregation our tables hold for a wallet may be answered to this
 * request. THE gate of every public function that takes a wallet. A wallet our
 * tables know nothing about is public (there is nothing to show). The owner is
 * recognised only by a valid session whose wallet is this one; a failed or
 * foreign token is a stranger. Any error reads as PRIVATE.
 */
export async function walletView(db: IteraClient, request: Request, wallet: string): Promise<WalletView> {
  try {
    const accounts = await accountsOfWallet(db, wallet);
    const isPublic = accounts.length === 0 || walletIsPublic([...(await factsOf(db, accounts)).values()]);
    let owner = false;
    // The anon key every client sends as its bearer names no user: it is not worth a trip to the auth server.
    if (unverifiedSubject(bearerToken(request)) !== null) {
      const caller = await resolveCaller(db, request).catch(() => 'unauthorized' as const);
      owner = typeof caller !== 'string' && caller.wallet === wallet && accounts.includes(caller.iteraUserId);
    }
    return { public: isPublic, owner, visible: isPublic || owner };
  } catch (error) {
    console.error('privacy: visibility unavailable', error instanceof Error ? error.message : error);
    return { public: false, owner: false, visible: false };
  }
}

export async function setProfile(db: IteraClient, userId: string, isPublic: boolean): Promise<void> {
  const { error } = await db.from('profile_settings').upsert({ user_id: userId, public_profile: isPublic, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(`profile_settings: ${error.message}`);
}

/** The contact of a listing. Read only for its owner and for a company the verdict let through. */
export async function loadContact(db: IteraClient, userId: string): Promise<Contact | null> {
  const { data, error } = await db.from('talent_contacts').select(CONTACT_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`talent_contacts read: ${error.code ?? 'error'}`);
  return contactOf(data as Partial<Contact> | null);
}

export async function saveContact(db: IteraClient, userId: string, contact: Contact): Promise<void> {
  const { error } = await db.from('talent_contacts').upsert({ user_id: userId, ...contact, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  // The code only: a database message about a refused row can quote the row, and this row is a contact.
  if (error) throw new Error(`talent_contacts write: ${error.code ?? 'error'}`);
}

/** Deletes the contact. Leaving the board calls this before the listing goes (the foreign key would do it too). */
export async function deleteContact(db: IteraClient, userId: string): Promise<void> {
  const { error } = await db.from('talent_contacts').delete().eq('user_id', userId);
  if (error) throw new Error(`talent_contacts delete: ${error.code ?? 'error'}`);
}

/** Which of these listed accounts have a contact: ids only, never a value. */
export async function accountsWithContact(db: IteraClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await db.from('talent_contacts').select('user_id').in('user_id', userIds);
  if (error) throw new Error(`talent_contacts: ${error.message}`);
  return new Set(((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
}

/** How many different companies were shown this learner's contact, and when last. The learner never sees who. */
export async function lookedAt(db: IteraClient, learnerUserId: string): Promise<{ companies_looked: number; last_looked_at: string | null }> {
  const { data, error } = await db.from('talent_contact_reveals').select('company_user_id,revealed_at').eq('learner_user_id', learnerUserId).order('revealed_at', { ascending: false }).limit(1000);
  if (error) throw new Error(`talent_contact_reveals: ${error.message}`);
  const rows = (data ?? []) as Array<{ company_user_id: string; revealed_at: string }>;
  return { companies_looked: new Set(rows.map((row) => row.company_user_id)).size, last_looked_at: rows[0]?.revealed_at ?? null };
}

/** The different learners this company was shown in the last 24 hours. */
export async function seenToday(db: IteraClient, companyUserId: string, now = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - REVEAL_WINDOW_MS).toISOString();
  const { data, error } = await db.from('talent_contact_reveals').select('learner_user_id').eq('company_user_id', companyUserId).gte('revealed_at', since).limit(1000);
  if (error) throw new Error(`talent_contact_reveals: ${error.message}`);
  return [...new Set(((data ?? []) as Array<{ learner_user_id: string }>).map((row) => row.learner_user_id))];
}

export async function recordReveal(db: IteraClient, companyUserId: string, learnerUserId: string, via: CompanyVia): Promise<string> {
  const { data, error } = await db.from('talent_contact_reveals').insert({ company_user_id: companyUserId, learner_user_id: learnerUserId, via }).select('revealed_at').single();
  if (error) throw new Error(`talent_contact_reveals insert: ${error.message}`);
  return data.revealed_at as string;
}

/**
 * Whether the caller is a company, from our tables alone: staff of a tenant
 * that has posted a bounty, or a wallet whose bounty was funded (its escrow
 * account was seen funded on chain when the row was opened). Nothing the
 * request says takes part.
 */
export async function companyOf(db: IteraClient, caller: Caller): Promise<CompanyVia | null> {
  const staffOf = staffTenantIds(await loadMemberships(db, caller.iteraUserId));
  const [sponsored, funded] = await Promise.all([
    staffOf.length > 0 ? db.from('bounties').select('id', { count: 'exact', head: true }).in('tenant_id', staffOf).eq('origin', 'team') : Promise.resolve({ count: 0, error: null }),
    caller.wallet ? db.from('bounties').select('id', { count: 'exact', head: true }).eq('origin', 'wallet').eq('sponsor_wallet', caller.wallet).not('funded_at', 'is', null) : Promise.resolve({ count: 0, error: null }),
  ]);
  if (sponsored.error) throw new Error(`bounties: ${sponsored.error.message}`);
  if (funded.error) throw new Error(`bounties: ${funded.error.message}`);
  return companyVia({ staffOfSponsorTenant: (sponsored.count ?? 0) > 0, fundedBounties: funded.count ?? 0 });
}

/** The `company` block: whether the caller may be shown contacts, and how many are left today. */
export async function companyStatus(db: IteraClient, caller: Caller) {
  const via = await companyOf(db, caller);
  return { is_company: via !== null, via, reveals_left_today: via ? revealsLeft(await seenToday(db, caller.iteraUserId)) : 0, reveals_per_day: REVEALS_PER_DAY };
}
