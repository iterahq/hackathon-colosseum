import { clean } from './bounty.ts';

export const HEADLINE_MAX = 120;
export const BOARD_LIMIT = 60;

export type HeadlineVerdict = { ok: true; value: string | null } | { ok: false; error: 'invalid_headline' };

const LINK = /(https?:|ftp:|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|dev|app|xyz|co|me|ly|br|gg|sh|ai)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+/;
const HANDLE = /(^|[\s(])@[\p{L}\p{N}_.]{2,}/u;

/** A headline fit for a public card: one trimmed line of plain text, no link, no e-mail, no @handle. */
export function parseHeadline(input: unknown): HeadlineVerdict {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, error: 'invalid_headline' };
  const text = (clean(input) as string).replace(/\s+/g, ' ').trim();
  if (!text) return { ok: true, value: null };
  if ([...text].length > HEADLINE_MAX) return { ok: false, error: 'invalid_headline' };
  if ([...text].some((char) => { const code = char.charCodeAt(0); return code < 0x20 || (code >= 0x7f && code <= 0x9f); })) return { ok: false, error: 'invalid_headline' };
  if (/[<>]/.test(text) || LINK.test(text) || EMAIL.test(text) || HANDLE.test(text)) return { ok: false, error: 'invalid_headline' };
  return { ok: true, value: text };
}

export interface CertificationFacts {
  stamped_days: number;
  total_days: number;
}

export type ListVerdict = { may_list: true; reason: null } | { may_list: false; reason: 'no_wallet' | 'nothing_proven' };

/** A learner may list with a linked wallet and at least one stamped day on a minted certification. */
export function listVerdict(wallet: string | null, certifications: readonly CertificationFacts[]): ListVerdict {
  if (!wallet) return { may_list: false, reason: 'no_wallet' };
  if (!certifications.some((entry) => entry.stamped_days > 0)) return { may_list: false, reason: 'nothing_proven' };
  return { may_list: true, reason: null };
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** Days stamped and days offered on one minted `trail_pass` row. */
export function certificationFacts(state: Record<string, unknown>): CertificationFacts {
  const stamped = Array.isArray(state.stamped_days) ? state.stamped_days.filter((day) => typeof day === 'number').length : count(state.days_done);
  return { stamped_days: stamped, total_days: count(state.total_days) };
}

export interface TalentCard {
  wallet: string;
  name: string | null;
  avatar: { key: string; title: string; thumb_url: string; rarity: string } | null;
  headline: string | null;
  /** A company can ask for this learner's contact. The contact is never on a card. */
  has_contact: boolean;
  stamped_days: number;
  total_days: number;
  certifications: number;
  /** `graded`: the share the evidence document of that claim states ("10/12"); `null` when it states none. */
  capabilities: Array<{ key: string; title: string; graded?: string | null }>;
  bounties_paid: number;
  bounties_paid_lamports: number;
  last_stamp_at: string | null;
  profile_url: string;
  team_test: boolean;
}

export interface TalentFilter {
  capability: string | null;
  minDays: number;
}

/** Reads `capability` and `min_days` from the query string; anything malformed filters nothing. */
export function parseFilter(params: URLSearchParams): TalentFilter {
  const capability = params.get('capability');
  const days = Number(params.get('min_days'));
  return {
    capability: capability && /^[a-z0-9-]{1,40}$/.test(capability) ? capability : null,
    minDays: Number.isInteger(days) && days > 0 && days <= 1000 ? days : 0,
  };
}

export function filterCards(cards: readonly TalentCard[], filter: TalentFilter): TalentCard[] {
  return cards.filter((card) => card.stamped_days >= filter.minDays && (!filter.capability || card.capabilities.some((entry) => entry.key === filter.capability)));
}

/** Real learners first, then more stamped days, then the most recent stamp. */
export function orderCards(cards: readonly TalentCard[]): TalentCard[] {
  return [...cards].sort(
    (a, b) =>
      Number(a.team_test) - Number(b.team_test) ||
      b.stamped_days - a.stamped_days ||
      (b.last_stamp_at ?? '').localeCompare(a.last_stamp_at ?? '') ||
      a.wallet.localeCompare(b.wallet),
  );
}

/** Capabilities that at least one card carries, in the order the first card lists them. */
export function capabilityOptions(cards: readonly TalentCard[], order: readonly string[]): Array<{ key: string; title: string }> {
  const found = new Map<string, string>();
  for (const card of cards) for (const entry of card.capabilities) if (!found.has(entry.key)) found.set(entry.key, entry.title);
  const rank = (key: string) => { const index = order.indexOf(key); return index < 0 ? order.length : index; };
  return [...found].map(([key, title]) => ({ key, title })).sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}
