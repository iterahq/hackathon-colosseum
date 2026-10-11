/** Pure joins of the passport: trails x earned achievements -> pages, catalog -> medals. */
import type { AchievementView, PassportMedal, PassportPageData, UserAchievement } from '@/types/achievements';
import type { I18nText } from '@/types/content';
import type { Trail } from '@/types/trailDashboard';
import { trailName } from '@/utils/trailDashboard';

const MEDAL_KINDS = new Set(['streak', 'milestone']);
const MEDAL_SHELF = 8;

export type Pick = (text: I18nText) => string;

function glyphOf(item: AchievementView, text: string): string {
  const art = item.art;
  const set = typeof art.glyph === 'string' ? art.glyph : typeof art.label === 'string' ? art.label : '';
  return (set || text.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3)).toUpperCase();
}

/** The earned row that speaks for a trail: the minted, then the most recent. */
function rowFor(trailId: string, items: readonly AchievementView[]): { row: UserAchievement; tier: string | null } | null {
  const score = (i: AchievementView) => [0, i.earned?.mintStatus === 'minted' ? 1 : 0, i.earned?.earnedAt ?? ''] as const;
  const mine = items.filter((i) => i.earned && i.earned.refId === trailId && i.kind === 'trail');
  mine.sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    return y[0] - x[0] || y[1] - x[1] || y[2].localeCompare(x[2]);
  });
  const top = mine[0];
  return top?.earned ? { row: top.earned, tier: top.tier } : null;
}

/** The day stamps of a trail among every row the learner earned: awarded by the server, and written on chain. */
function dayStamps(trail: Trail, rows: readonly UserAchievement[]): { awarded: number; stamped: number } {
  const days = new Set(trail.days.map((d) => d.id));
  const mine = rows.filter((r) => r.achievementKey === 'day_stamp' && r.refId !== null && days.has(r.refId));
  return { awarded: mine.length, stamped: mine.filter((r) => r.mintStatus === 'minted').length };
}

/**
 * `rows`: every earned row, one per day stamp. Without them a page counts no stamp at all: the UI never
 * calls a day "stamped" on the strength of its activities alone.
 */
export function buildPages(trails: readonly Trail[], items: readonly AchievementView[], pick: Pick, rows: readonly UserAchievement[] = []): PassportPageData[] {
  return trails.map((trail) => {
    const earned = rowFor(trail.id, items);
    const stamps = dayStamps(trail, rows);
    return {
      credentialId: earned?.row.id ?? null,
      trailId: trail.id,
      trailTitle: pick(trailName(trail.title)),
      colorIndex: trail.colorIndex,
      daysDone: trail.doneDays,
      daysAwarded: Math.min(stamps.awarded, trail.days.length),
      daysStamped: Math.min(stamps.stamped, trail.days.length),
      totalDays: trail.days.length,
      tier: earned?.tier ?? null,
      mintStatus: earned?.row.mintStatus ?? 'unclaimed',
      assetAddress: earned?.row.assetAddress ?? null,
      txSignature: earned?.row.txSignature ?? null,
      earnedAt: earned?.row.earnedAt ?? null,
      locked: trail.status === 'locked',
      lockedBy: trail.unlockedBy ? pick(trailName(trail.unlockedBy)) : null,
    };
  });
}

export function buildMedals(items: readonly AchievementView[], pick: Pick): PassportMedal[] {
  return items
    .filter((i) => MEDAL_KINDS.has(i.kind))
    .sort((a, b) => a.sort - b.sort)
    // The shelf shows a fixed set of goals; past it, only what was actually earned (a podium, an invite).
    .filter((i, index) => index < MEDAL_SHELF || Boolean(i.earned))
    .map((i) => {
      const title = pick(i.title);
      return {
        key: i.key,
        kind: i.kind,
        credentialId: i.earned?.id ?? null,
        title,
        description: pick(i.description),
        glyph: glyphOf(i, title),
        earned: Boolean(i.earned),
        mintStatus: i.earned?.mintStatus ?? 'unclaimed',
        assetAddress: i.earned?.assetAddress ?? null,
        txSignature: i.earned?.txSignature ?? null,
      };
    });
}

/**
 * Stamps = days written on chain across every page; `pending` = days done whose stamp is not on chain
 * (held by the server, or minting); `held` = the part of pending the server did not award. A page with
 * a day done counts as started.
 */
export const totals = (pages: readonly PassportPageData[], medals: readonly PassportMedal[]) => ({
  pages: pages.filter((p) => p.daysDone > 0).length,
  stamps: pages.reduce((s, p) => s + p.daysStamped, 0),
  pending: pages.reduce((s, p) => s + pendingOf(p), 0),
  held: pages.reduce((s, p) => s + Math.max(0, p.daysDone - p.daysAwarded), 0),
  medals: medals.filter((m) => m.earned).length,
});

/** The first day done whose stamp is not on chain, as a lesson id: where "redo one exercise" leads. */
export function heldLessonId(trails: readonly Trail[], rows: readonly UserAchievement[]): string | null {
  const stamped = new Set(rows.filter((r) => r.achievementKey === 'day_stamp' && r.mintStatus === 'minted').map((r) => r.refId));
  for (const trail of trails) {
    const day = trail.days.find((d) => d.total > 0 && d.done >= d.total && !stamped.has(d.id));
    if (day) return day.id;
  }
  return null;
}

/** Days done on this page whose stamp is not on chain yet. */
export const pendingOf = (p: { daysDone: number; daysStamped: number }): number => Math.max(0, p.daysDone - p.daysStamped);

export const isGold = (p: PassportPageData): boolean => p.totalDays > 0 && p.daysStamped >= p.totalDays;
