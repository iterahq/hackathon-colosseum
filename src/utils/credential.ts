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

/** Reads the on-chain attributes (`day_1`..`day_n`, `trail`, `tier`) into what the page shows. */
export function credentialFacts(c: CredentialVerification, pick: (t: I18nText) => string): CredentialFacts {
  const days = c.attributes
    .map((a) => ({ m: /^day_(\d+)$/.exec(a.key), done: TRUE.has(a.value.toLowerCase()) }))
    .filter((d): d is { m: RegExpExecArray; done: boolean } => d.m != null)
    .map((d) => ({ day: Number(d.m[1]), done: d.done }))
    .sort((a, b) => a.day - b.day);
  const attr = (key: string) => c.attributes.find((a) => a.key === key)?.value ?? null;
  const title = c.achievement?.title;
  const named = typeof title === 'string' ? title : title ? pick(title) : '';
  const done = days.filter((d) => d.done).length;
  return {
    trail: attr('trail') ?? (named || null),
    tier: c.achievement?.tier ?? attr('tier'),
    daysDone: done,
    totalDays: days.length,
    days,
    date: c.minted_at,
  };
}
