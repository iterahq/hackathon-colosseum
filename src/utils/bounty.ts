import type { Bounty, BountyStatus } from '@/types/bounty';

export const MIN_REWARD_LAMPORTS = 1_000_000;
export const MAX_REWARD_LAMPORTS = 500_000_000;
const LAMPORTS_PER_SOL = 9;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const isValidSlug = (slug: string): boolean => slug.length > 0 && slug.length <= 80 && SLUG_PATTERN.test(slug);

export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** Decimal SOL text to integer lamports without touching floats. Null when it is not a plain amount of at most nine decimals. */
export function solToLamports(input: string): number | null {
  const text = input.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(LAMPORTS_PER_SOL, '0'));
  const lamports = whole * 1_000_000_000 + fraction;
  return Number.isSafeInteger(lamports) ? lamports : null;
}

export const isRewardInRange = (lamports: number): boolean => lamports >= MIN_REWARD_LAMPORTS && lamports <= MAX_REWARD_LAMPORTS;

/** Only a plain https link may be rendered as one. */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('https://')) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const ORDER: Record<BountyStatus, number> = {
  open: 0,
  claimed: 1,
  submitted: 1,
  paying: 1,
  paid: 2,
  awaiting_funding: 3,
  expired: 3,
  refunding: 3,
  refunded: 3,
};

/** Open first, then in progress, then paid, then the rest. Stable inside a rank. */
export function sortBounties<T extends Pick<Bounty, 'status'>>(items: readonly T[]): T[] {
  return items.map((item, index) => ({ item, index })).sort((a, b) => ORDER[a.item.status] - ORDER[b.item.status] || a.index - b.index).map((e) => e.item);
}

export type StatusTone = 'open' | 'progress' | 'paid' | 'muted';

export function statusTone(status: BountyStatus): StatusTone {
  if (status === 'open') return 'open';
  if (status === 'claimed' || status === 'submitted' || status === 'paying') return 'progress';
  if (status === 'paid') return 'paid';
  return 'muted';
}

export const REFUNDABLE: readonly BountyStatus[] = ['open', 'expired', 'awaiting_funding'];

/** `2d 3h`, `5h 12min`, `14min` or `0min`. */
export function formatRemaining(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}min`;
  return `${minutes}min`;
}

export function formatWhen(iso: string | null, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export type CreateField = 'slug' | 'sponsor' | 'text' | 'reward' | 'requirement' | 'deadline' | 'refund';

const CREATE_ERRORS: Record<string, CreateField> = {
  invalid_slug: 'slug',
  slug_taken: 'slug',
  invalid_sponsor: 'sponsor',
  invalid_text: 'text',
  invalid_reward: 'reward',
  invalid_requirement: 'requirement',
  invalid_deadline: 'deadline',
  invalid_refund_address: 'refund',
};

/** The form field a `create` refusal belongs to, or null for a code the form cannot place. */
export const createErrorField = (code: string | null): CreateField | null => (code ? (CREATE_ERRORS[code] ?? null) : null);

export const isCreateErrorCode = (code: string | null): code is string => Boolean(code && code in CREATE_ERRORS);
