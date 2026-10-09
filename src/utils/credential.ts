import type { CredentialVerification } from '@/types/achievements';
import type { I18nText } from '@/types/content';

export interface CredentialFacts {
  trail: string | null;
  tier: string | null;
  daysDone: number;
  totalDays: number;
  days: { day: number; done: boolean }[];
  date: string | null;
}

const TRUE = new Set(['true', '1', 'yes', 'done', 'completed']);
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN);

/** Reads the on-chain attributes (`days_done`, `day_n`, `trail`, `tier`) and the catalog row into what the page shows. */
export function credentialFacts(c: CredentialVerification, pick: (t: I18nText) => string, locale: 'pt' | 'en' = 'pt'): CredentialFacts {
  const attr = (key: string) => c.attributes.find((a) => a.key === key)?.value ?? null;
  const stamped = new Set<number>((c.achievement?.stamps ?? []).map((s) => s.day));
  let listed = 0;
  for (const a of c.attributes) {
    const m = /^day_(\d+)$/.exec(a.key);
    if (m) listed = Math.max(listed, Number(m[1]));
    if (m && TRUE.has(a.value.toLowerCase())) stamped.add(Number(m[1]));
  }
  const declared = [num(attr('days_done')), num(c.achievement?.state.days_done)].find((n) => Number.isFinite(n));
  const daysDone = Math.max(stamped.size, declared ?? 0);
  const total = [num(attr('total_days')), num(c.achievement?.state.total_days)].find((n) => Number.isFinite(n) && n > 0) ?? 0;
  const totalDays = Math.max(total, listed, ...stamped, 0);
  const days = Array.from({ length: totalDays }, (_, i) => ({ day: i + 1, done: stamped.has(i + 1) || (stamped.size === 0 && i < daysDone) }));
  const title = c.achievement?.title;
  const named = typeof title === 'string' ? title : title ? pick(title) : '';
  const bag = c.achievement?.state.trail_title;
  const localized = bag && typeof bag === 'object' ? (bag as Record<string, unknown>)[locale] : null;
  const trail = c.achievement?.trail || (typeof localized === 'string' && localized ? localized : null) || attr('trail') || named || null;
  return { trail, tier: c.achievement?.tier ?? attr('tier'), daysDone, totalDays, days, date: c.minted_at };
}
