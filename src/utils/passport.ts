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

export function buildPages(trails: readonly Trail[], items: readonly AchievementView[], pick: Pick): PassportPageData[] {
  return trails.map((trail) => {
    const earned = rowFor(trail.id, items);
    return {
      credentialId: earned?.row.id ?? null,
      trailId: trail.id,
      trailTitle: pick(trailName(trail.title)),
      colorIndex: trail.colorIndex,
      daysDone: trail.doneDays,
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

/** Stamps = days stamped across every page; a page with a stamp counts as started. */
export const totals = (pages: readonly PassportPageData[], medals: readonly PassportMedal[]) => ({
  pages: pages.filter((p) => p.daysDone > 0).length,
  stamps: pages.reduce((s, p) => s + p.daysDone, 0),
  medals: medals.filter((m) => m.earned).length,
});

export const isGold = (p: PassportPageData): boolean => p.totalDays > 0 && p.daysDone >= p.totalDays;
