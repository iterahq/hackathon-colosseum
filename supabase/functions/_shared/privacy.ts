/**
 * Privacy, as pure rules: when a profile is public, what a contact may be, who
 * is a company, and how many contacts a company may be shown in a day.
 *
 * A wallet is anonymous until its owner says otherwise. The contact is
 * personal data: nothing in this file logs it, and the only functions that
 * return one are named where they do.
 */

/** A company is shown the contact of at most this many DIFFERENT learners in any 24 hours. */
export const REVEALS_PER_DAY = 10;
export const REVEAL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CONTACT_FIELDS = ['email', 'telegram', 'linkedin', 'link'] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type Contact = Record<ContactField, string | null>;
export const CONTACT_MAX: Record<ContactField, number> = { email: 120, telegram: 32, linkedin: 120, link: 200 };

export type ProfileSource = 'chosen' | 'existing_account' | 'new_account';

export interface ProfileFacts {
  /** The learner's own choice; `null`: none made. */
  chosen: boolean | null;
  /** When the account was created (ISO). */
  createdAt: string | null;
  /** `onchain_config.profile_private_from`: accounts created from this moment on are private until they choose. */
  cutoff: string | null;
}

/**
 * Whether a profile page is shown to others. A choice always wins. With no
 * choice: an account that existed before the cutoff stays visible (nobody asked
 * to hide it), an account created from the cutoff on is private. With no cutoff
 * recorded, or a date that cannot be read, the answer is PRIVATE: when in doubt
 * nothing is shown.
 */
export function profileVisibility(facts: ProfileFacts): { public: boolean; source: ProfileSource } {
  if (facts.chosen !== null) return { public: facts.chosen, source: 'chosen' };
  const created = facts.createdAt ? Date.parse(facts.createdAt) : Number.NaN;
  const cutoff = facts.cutoff ? Date.parse(facts.cutoff) : Number.NaN;
  const existed = Number.isFinite(created) && Number.isFinite(cutoff) && created < cutoff;
  return { public: existed, source: existed ? 'existing_account' : 'new_account' };
}

/** A wallet's page is private when ANY account behind it is private: one wallet is one person. */
export function walletIsPublic(accounts: readonly ProfileFacts[]): boolean {
  return accounts.every((account) => profileVisibility(account).public);
}

/** What a stranger gets for a private wallet: the address they asked for and one flag. */
export function privateProfile(wallet: string) {
  return { wallet, cluster: 'devnet', private: true as const };
}

// deno-lint-ignore no-control-regex
const FORBIDDEN = /[\s<>"'`\\\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;
const TELEGRAM = /^[a-z0-9_]{5,32}$/;
const LINKEDIN = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9%_-]{3,100}\/?$/;

function httpsLink(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || url.port) return null;
  // Exactly what was typed is kept: a link the parser had to repair is not one the learner wrote.
  return url.href === text || `${url.origin}/` === `${text}/` ? text : null;
}

const CHECKS: Record<ContactField, (text: string) => string | null> = {
  email: (text) => (EMAIL.test(text) ? text.toLowerCase() : null),
  telegram: (text) => {
    const handle = text.replace(/^@/, '').toLowerCase();
    return TELEGRAM.test(handle) ? handle : null;
  },
  linkedin: (text) => (LINKEDIN.test(text) ? text : null),
  link: httpsLink,
};

export type ContactParse = { ok: true; value: Contact } | { ok: false; error: 'contact_required' } | { ok: false; error: 'invalid_contact'; field: ContactField };

/**
 * The contact of a listing: an e-mail, a Telegram handle, a LinkedIn profile, a
 * link. At least one. Each is one plain token: a space, a quote, markup or a
 * control character refuses the field (nothing is stripped and kept), as does
 * anything over its length or not of its shape. Unknown keys are ignored.
 */
export function parseContact(raw: unknown): ContactParse {
  const given = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const contact: Contact = { email: null, telegram: null, linkedin: null, link: null };
  for (const field of CONTACT_FIELDS) {
    const value = given[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') return { ok: false, error: 'invalid_contact', field };
    const text = value.trim();
    if (text === '') continue;
    if (text.length > CONTACT_MAX[field] || FORBIDDEN.test(text)) return { ok: false, error: 'invalid_contact', field };
    const checked = CHECKS[field](text);
    if (checked === null || checked.length > CONTACT_MAX[field]) return { ok: false, error: 'invalid_contact', field };
    contact[field] = checked;
  }
  return CONTACT_FIELDS.some((field) => contact[field] !== null) ? { ok: true, value: contact } : { ok: false, error: 'contact_required' };
}

/** A stored row as a `Contact`, or `null` when there is none. */
export function contactOf(row: Partial<Record<ContactField, string | null>> | null | undefined): Contact | null {
  if (!row) return null;
  const contact: Contact = { email: row.email ?? null, telegram: row.telegram ?? null, linkedin: row.linkedin ?? null, link: row.link ?? null };
  return CONTACT_FIELDS.some((field) => contact[field] !== null) ? contact : null;
}

export type CompanyVia = 'funded_bounty' | 'tenant_staff';

/**
 * Who is a company: the staff of a tenant that sponsors bounties, or a wallet
 * that funded at least one bounty. Nobody else is shown a contact.
 */
export function companyVia(facts: { staffOfSponsorTenant: boolean; fundedBounties: number }): CompanyVia | null {
  if (facts.staffOfSponsorTenant) return 'tenant_staff';
  return facts.fundedBounties > 0 ? 'funded_bounty' : null;
}

export type RevealVerdict =
  | { ok: true; via: CompanyVia; left: number }
  | { ok: false; status: 403; error: 'not_a_company' | 'own_listing' }
  | { ok: false; status: 404; error: 'not_listed' | 'no_contact' }
  | { ok: false; status: 429; error: 'reveal_limit' };

/**
 * Whether this caller is shown this learner's contact now. `seenToday`: the
 * different learners the company was shown in the last 24 hours. Looking again
 * at one of them does not use the allowance up; a new one past the cap is refused.
 */
export function revealVerdict(facts: { via: CompanyVia | null; callerUserId: string; learnerUserId: string | null; listed: boolean; hasContact: boolean; seenToday: readonly string[] }): RevealVerdict {
  if (!facts.via) return { ok: false, status: 403, error: 'not_a_company' };
  if (!facts.listed || !facts.learnerUserId) return { ok: false, status: 404, error: 'not_listed' };
  if (facts.learnerUserId === facts.callerUserId) return { ok: false, status: 403, error: 'own_listing' };
  if (!facts.hasContact) return { ok: false, status: 404, error: 'no_contact' };
  const seen = new Set(facts.seenToday);
  if (!seen.has(facts.learnerUserId) && seen.size >= REVEALS_PER_DAY) return { ok: false, status: 429, error: 'reveal_limit' };
  seen.add(facts.learnerUserId);
  return { ok: true, via: facts.via, left: Math.max(0, REVEALS_PER_DAY - seen.size) };
}

export function revealsLeft(seenToday: readonly string[]): number {
  return Math.max(0, REVEALS_PER_DAY - new Set(seenToday).size);
}
