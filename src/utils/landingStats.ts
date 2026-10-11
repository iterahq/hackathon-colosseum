import type { BountyStats } from '@/types/bounty';
import type { CircuitCounter } from '@/types/circuit';
import { plural } from '@/utils/bounty';
import { judgePaidHint } from '@/utils/bountyJudge';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Who the paid bounties went to, inside the card: the team's rehearsal is never counted as a stranger's payout. */
export function paidHint(stats: BountyStats, t: Translate): string {
  if (stats.paidCount === 0) return t('bounty.stats.paidHint.none');
  const judged = judgePaidHint(t, stats);
  if (judged) return judged;
  if (stats.rehearsalPaidCount === 0) return t('bounty.stats.paidHint.outside');
  return plural(t, 'bounty.stats.paidHint.mixed', stats.rehearsalPaidCount, { outside: stats.outsidePaidCount });
}

/** The arithmetic behind the stamps number, in the same card as the number: share of each purchase and the fee of one stamp. */
export function stampsHint(counter: CircuitCounter, t: Translate, numberLocale: string): string {
  return t('landing.live.stampsHint', { purchases: counter.purchases.toLocaleString(numberLocale), share: counter.sharePercent, fee: counter.stampFeeLamports.toLocaleString(numberLocale) });
}

/** The time the numbers were read, in the viewer's clock, so a number that moves between two visits has a visible "as of". */
export function readAtLabel(stamps: ReadonlyArray<string | null | undefined>, locale: string): string | null {
  const times = stamps.map((s) => (s ? Date.parse(s) : NaN)).filter((n) => Number.isFinite(n));
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toLocaleTimeString(locale === 'pt' ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

/** "US$ 0.20" style, from cents, in the viewer's locale. */
export function usd(cents: number, locale: string): string {
  const amount = (cents / 100).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `US$ ${amount}`;
}
