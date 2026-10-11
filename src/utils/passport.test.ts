import { describe, expect, it } from 'vitest';
import type { AchievementView } from '@/types/achievements';
import type { Trail } from '@/types/trailDashboard';
import { buildMedals, buildPages, isGold, totals } from '@/utils/passport';

const pick = (t: Record<string, string>) => t.pt ?? '';
const trail = (id: string, doneDays: number, days: number, status: Trail['status'] = 'in_progress'): Trail => ({
  id,
  programSlug: 'p',
  programTitle: { pt: 'P' },
  title: { pt: `Semana · ${id}` },
  days: Array.from({ length: days }, (_, i) => ({ id: `${id}${i}`, title: { pt: 'd' }, total: 1, done: i < doneDays ? 1 : 0, state: 'upcoming' as const })),
  totalActivities: days,
  doneActivities: doneDays,
  doneDays,
  status,
  lastProgressAt: null,
  unlockedBy: status === 'locked' ? { pt: 'Semana · HTML' } : null,
  colorIndex: 0,
});
const item = (key: string, kind: AchievementView['kind'], over: Partial<AchievementView> = {}): AchievementView => ({
  key, kind, tier: null, title: { pt: key }, description: { pt: `req ${key}` }, art: {}, sort: 0, earned: null, ...over,
});
const earned = (refId: string | null, over = {}) => ({ id: 'row1', achievementKey: 'k', refId, earnedAt: '2026-10-09T10:00:00Z', mintStatus: 'minted' as const, assetAddress: 'A1', txSignature: 'S1', ...over });

describe('buildPages', () => {
  it('joins the earned trail award by ref id', () => {
    const pages = buildPages([trail('t1', 5, 5), trail('t2', 0, 3)], [item('trail_t1', 'trail', { tier: 'gold', earned: earned('t1') })], pick);
    expect(pages[0]).toMatchObject({ trailTitle: 't1', assetAddress: 'A1', tier: 'gold', mintStatus: 'minted' });
    expect(pages[1]).toMatchObject({ assetAddress: null, mintStatus: 'unclaimed' });
    expect(isGold(pages[0])).toBe(true);
    expect(isGold(pages[1])).toBe(false);
  });

  it('ignores day stamps: they belong to the passport row, not to a trail', () => {
    const pages = buildPages([trail('t1', 5, 5)], [item('day_stamp', 'day', { earned: earned('t1', { assetAddress: 'DAY' }) })], pick);
    expect(pages[0].assetAddress).toBeNull();
  });

  it('counts a day as stamped only from its own minted row, never from the activities done', () => {
    const rows = [
      { ...earned('t10'), id: 'r1', achievementKey: 'day_stamp' },
      { ...earned('t11'), id: 'r2', achievementKey: 'day_stamp', mintStatus: 'pending' as const },
      { ...earned('zz'), id: 'r3', achievementKey: 'day_stamp' },
    ];
    const [page] = buildPages([trail('t1', 3, 5)], [], pick, rows);
    expect(page).toMatchObject({ daysDone: 3, daysAwarded: 2, daysStamped: 1 });
    expect(buildPages([trail('t1', 3, 5)], [], pick)[0]).toMatchObject({ daysDone: 3, daysAwarded: 0, daysStamped: 0 });
  });

  it('marks locked pages with the predecessor name', () => {
    const [page] = buildPages([trail('t3', 0, 3, 'locked')], [], pick);
    expect(page).toMatchObject({ locked: true, lockedBy: 'HTML' });
  });
});

describe('buildMedals and totals', () => {
  it('keeps streak and milestone items, sorted, at most eight', () => {
    const items = [item('b', 'streak', { sort: 2 }), item('a', 'milestone', { sort: 1 }), item('d', 'day'), ...Array.from({ length: 8 }, (_, i) => item(`x${i}`, 'streak', { sort: 10 + i }))];
    const medals = buildMedals(items, pick);
    expect(medals.map((m) => m.key).slice(0, 2)).toEqual(['a', 'b']);
    expect(medals).toHaveLength(8);
  });

  it('shows an earned medal even past the shelf, and hides an unearned one there', () => {
    const base = Array.from({ length: 8 }, (_, i) => item(`m${i}`, 'milestone', { sort: i }));
    const podium = item('podium_1', 'milestone', { sort: 120, earned: earned(null) });
    const locked = item('podium_2', 'milestone', { sort: 121 });
    expect(buildMedals([...base, podium, locked], pick).map((m) => m.key)).toEqual([...base.map((m) => m.key), 'podium_1']);
  });

  it('counts stamps, started pages and earned medals', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ ...earned(`t1${i}`), id: `r${i}`, achievementKey: 'day_stamp' }));
    const pages = buildPages([trail('t1', 4, 5), trail('t2', 0, 3)], [], pick, rows);
    const medals = buildMedals([item('m', 'streak', { earned: earned(null) })], pick);
    expect(totals(pages, medals)).toEqual({ pages: 1, stamps: 3, pending: 1, held: 1, medals: 1 });
  });
});
