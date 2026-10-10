import { describe, expect, it } from 'vitest';
import {
  EARN_RULES,
  LIFE_PRICE,
  earnAmount,
  earnRulesView,
  earnsForAward,
  equipRequest,
  borderOf,
  cleanLessonIds,
  earningsOfRows,
  missingEarnings,
  equipVerdict,
  isThemeEntry,
  lifePurchase,
  lifeQty,
  mirrorCooldownLeftMs,
  mirrorStep,
  podiumReason,
  priceOf,
  pricesOf,
  spendRef,
  spendVerdict,
  themeOf,
  type PricedItem,
} from './crystals.ts';

const item = (key: string, kind: string, price: number | null, effect: Record<string, unknown> = {}): PricedItem => ({ key, kind, price_crystals: price, effect });
const CATALOG: PricedItem[] = [
  item('bg_obsidian', 'background', null, { background: '#0A0908', default: true }),
  item('bg_midnight', 'background', 75, { background: '#0B1020' }),
  item('icon_green', 'app_icon', null, { icon: '#3FD17F', default: true }),
  item('icon_gold', 'app_icon', 75, { icon: '#F5B301' }),
  item('outfit_crown', 'outfit', 150),
  item('life_gift', 'gift', null),
  { ...item('border_none', 'border', null, { default: true, border: null }), title_i18n: { pt: 'Sem borda', en: 'No border' } },
  { ...item('border_bronze', 'border', 100, { border: { style: 'solid', colors: ['#CD7F32'], glow: false, animated: false } }), title_i18n: { pt: 'Borda Bronze', en: 'Bronze border' } },
  { ...item('border_sol', 'border', null, { border: { style: 'gradient', colors: ['#F5B301', '#FFE08A'], glow: true, animated: false } }), title_i18n: { pt: 'Borda Sol', en: 'Sol border' } },
];
const NO_BORDER = { key: 'border_none', title: 'Sem borda', border: null };

describe('earn rules', () => {
  it('pays the amounts of the contract', () => {
    expect(Object.fromEntries(EARN_RULES.map((rule) => [rule.reason, rule.crystals]))).toEqual({
      lesson_completed: 2,
      lesson_clean: 3,
      day_completed: 10,
      trail_completed: 100,
      streak_7: 30,
      invite_friend: 50,
      invited: 20,
      podium_1: 30,
      podium_2: 20,
      podium_3: 10,
    });
    expect(earnAmount('invite_friend')).toBe(50);
  });

  it('labels every rule in both languages', () => {
    expect(earnRulesView('pt')[0]).toEqual({ reason: 'lesson_completed', crystals: 2, label: 'Lição concluída' });
    expect(earnRulesView('en').every((rule) => rule.label.length > 0)).toBe(true);
  });

  it('maps a new award to what it pays', () => {
    expect(earnsForAward('day_stamp')).toEqual(['lesson_completed', 'day_completed']);
    expect(earnsForAward('trail_complete')).toEqual(['trail_completed']);
    expect(earnsForAward('streak_7')).toEqual(['streak_7']);
    expect(earnsForAward('trail_pass')).toEqual([]);
    expect(earnsForAward('streak_3')).toEqual([]);
  });

  it('pays the three podium places and nothing else', () => {
    expect([1, 2, 3, 4, 0].map(podiumReason)).toEqual(['podium_1', 'podium_2', 'podium_3', null, null]);
  });
});

describe('prices', () => {
  it('lists the items sold for crystals plus the single life', () => {
    expect(pricesOf(CATALOG)).toEqual({ bg_midnight: 75, border_bronze: 100, icon_gold: 75, outfit_crown: 150, life: LIFE_PRICE });
  });

  it('reads a missing, zero or fractional price as not for sale', () => {
    expect([null, 0, -5, 1.5].map((price) => priceOf({ price_crystals: price }))).toEqual([null, null, null, null]);
    expect(priceOf({ price_crystals: 400 })).toBe(400);
  });
});

describe('spending', () => {
  it('refuses an item with no crystal price before looking at the balance', () => {
    expect(spendVerdict(null, 9999)).toEqual({ ok: false, error: 'not_for_crystals' });
  });

  it('refuses a balance one crystal short and accepts the exact price', () => {
    expect(spendVerdict(75, 74)).toEqual({ ok: false, error: 'insufficient_crystals', price: 75 });
    expect(spendVerdict(75, 75)).toEqual({ ok: true, price: 75 });
  });

  it('reads the quantity of lives: 1 by default, integers 1 to 5 only', () => {
    expect([undefined, null, 1, 5].map(lifeQty)).toEqual([1, 1, 1, 5]);
    expect([0, 6, 1.5, '2', -1].map(lifeQty)).toEqual([null, null, null, null, null]);
  });

  it('sells only the lives that fit and charges only those', () => {
    expect(lifePurchase({ lives: 4, maxLives: 5, qty: 1 })).toEqual({ added: 1, price: 5 });
    expect(lifePurchase({ lives: 3, maxLives: 5, qty: 5 })).toEqual({ added: 2, price: 10 });
    expect(lifePurchase({ lives: 0, maxLives: 5, qty: 5 })).toEqual({ added: 5, price: 25 });
  });

  it('sells no life to a full learner, bonus life or not', () => {
    expect(lifePurchase({ lives: 5, maxLives: 5, qty: 1 })).toBe('not_needed');
    expect(lifePurchase({ lives: 6, maxLives: 5, qty: 2 })).toBe('not_needed');
  });

  it('keys an owned-once item by what it is and a consumable by a fresh nonce', () => {
    expect(spendRef('bg_midnight', 'ref', false, 'n1')).toBe(spendRef('bg_midnight', 'ref', false, 'n2'));
    expect(spendRef('life', 'ref', true, 'n1')).not.toBe(spendRef('life', 'ref', true, 'n2'));
  });
});

describe('theme', () => {
  it('is the defaults when nothing was chosen', () => {
    expect(themeOf(CATALOG, {}, new Set())).toEqual({ background: { key: 'bg_obsidian', color: '#0A0908' }, icon: { key: 'icon_green', color: '#3FD17F' }, border: NO_BORDER });
  });

  it('wears an owned border with its spec and title, in the asked language', () => {
    const theme = themeOf(CATALOG, { border: 'border_bronze' }, new Set(['border_bronze']), 'en');
    expect(theme.border).toEqual({ key: 'border_bronze', title: 'Bronze border', border: { style: 'solid', colors: ['#CD7F32'], glow: false, animated: false } });
    // Chosen but never owned (a signature border without its avatar): the default.
    expect(themeOf(CATALOG, { border: 'border_sol' }, new Set()).border).toEqual(NO_BORDER);
  });

  it('reads only a well-formed border spec', () => {
    const row = (border: unknown) => ({ kind: 'border', effect: { border } as Record<string, unknown> });
    expect(borderOf(row({ style: 'conic', colors: ['#FF0000', '#00FF00'], glow: true, animated: true }))).toEqual({ style: 'conic', colors: ['#FF0000', '#00FF00'], glow: true, animated: true });
    expect(borderOf(row({ style: 'wavy', colors: ['#FF0000'] }))).toBeNull();
    expect(borderOf(row({ style: 'solid', colors: [] }))).toBeNull();
    expect(borderOf(row({ style: 'solid', colors: ['red'] }))).toBeNull();
    expect(borderOf(row(null))).toBeNull();
    expect(borderOf({ kind: 'background', effect: { border: { style: 'solid', colors: ['#FF0000'] } } })).toBeNull();
    expect(isThemeEntry(CATALOG.find((entry) => entry.key === 'border_none') as PricedItem)).toBe(true);
    expect(isThemeEntry(row({ style: 'solid', colors: [] }))).toBe(false);
  });

  it('wears what the learner chose and owns', () => {
    const theme = themeOf(CATALOG, { background: 'bg_midnight', icon: 'icon_gold' }, new Set(['bg_midnight']));
    expect(theme.background).toEqual({ key: 'bg_midnight', color: '#0B1020' });
    // Chosen but not owned (any more): back to the default.
    expect(theme.icon.key).toBe('icon_green');
  });

  it('still answers with a theme when the catalog is empty', () => {
    expect(themeOf([], { background: 'bg_midnight' }, new Set())).toEqual({
      background: { key: 'bg_obsidian', color: '#0A0908' },
      icon: { key: 'icon_green', color: '#3FD17F' },
      border: { key: 'border_none', title: 'No border', border: null },
    });
  });

  it('lets anyone equip a default, an owner equip a bought one, and nobody cross the kinds', () => {
    const byKey = (key: string) => CATALOG.find((entry) => entry.key === key);
    expect(equipVerdict('background', byKey('bg_obsidian'), new Set())).toBe('ok');
    expect(equipVerdict('background', byKey('bg_midnight'), new Set())).toBe('not_owned');
    expect(equipVerdict('background', byKey('bg_midnight'), new Set(['bg_midnight']))).toBe('ok');
    expect(equipVerdict('background', byKey('icon_gold'), new Set(['icon_gold']))).toBe('unknown_item');
    expect(equipVerdict('icon', byKey('outfit_crown'), new Set(['outfit_crown']))).toBe('unknown_item');
    expect(equipVerdict('icon', undefined, new Set())).toBe('unknown_item');
    expect(equipVerdict('border', byKey('border_none'), new Set())).toBe('ok');
    expect(equipVerdict('border', byKey('border_bronze'), new Set())).toBe('not_owned');
    expect(equipVerdict('border', byKey('border_sol'), new Set(['border_sol']))).toBe('ok');
    expect(equipVerdict('border', byKey('bg_midnight'), new Set(['bg_midnight']))).toBe('unknown_item');
  });

  it('reads the slots of an equip body, flat or under `equip`', () => {
    expect(equipRequest({ background: 'bg_midnight' })).toEqual({ background: 'bg_midnight' });
    expect(equipRequest({ equip: { icon: 'icon_gold', background: 'bg_grape' } })).toEqual({ icon: 'icon_gold', background: 'bg_grape' });
    expect(equipRequest({})).toBeNull();
    expect(equipRequest({ background: 7 })).toBeNull();
    expect(equipRequest({ icon: '' })).toBeNull();
    expect(equipRequest({ border: 'border_bronze' })).toEqual({ border: 'border_bronze' });
  });
});

describe('token mirror', () => {
  it('mints what is missing, burns what is over, and does nothing when equal', () => {
    expect(mirrorStep(120, 100)).toEqual({ op: 'mint', amount: 20 });
    expect(mirrorStep(40, 100)).toEqual({ op: 'burn', amount: 60 });
    expect(mirrorStep(0, 0)).toEqual({ op: 'none' });
  });

  it('holds a second write inside the cooldown', () => {
    const now = new Date('2026-10-10T12:00:10Z');
    expect(mirrorCooldownLeftMs(null, now)).toBe(0);
    expect(mirrorCooldownLeftMs('2026-10-10T12:00:00Z', now)).toBe(5_000);
    expect(mirrorCooldownLeftMs('2026-10-10T11:59:00Z', now)).toBe(0);
  });
});

describe('reconcile by award', () => {
  const LESSON = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';
  const ACTIVITIES = [
    { id: 'a1', lesson_id: LESSON },
    { id: 'a2', lesson_id: LESSON },
    { id: 'b1', lesson_id: OTHER },
  ];
  const ZONE = 'America/Sao_Paulo';

  it('a lesson with no lost life that day is clean; a loss on the day of the stamp is not', () => {
    const stamps = [
      { lessonId: LESSON, earnedAt: '2026-10-10T15:00:00Z' },
      { lessonId: OTHER, earnedAt: '2026-10-10T15:00:00Z' },
    ];
    expect(cleanLessonIds(stamps, ACTIVITIES, [], ZONE)).toEqual(new Set([LESSON, OTHER]));
    expect(cleanLessonIds(stamps, ACTIVITIES, [{ activity_id: 'a2', created_at: '2026-10-10T14:00:00Z' }], ZONE)).toEqual(new Set([OTHER]));
    // A loss on another day, or on an activity of another lesson, does not count against this stamp.
    expect(cleanLessonIds(stamps, ACTIVITIES, [{ activity_id: 'a1', created_at: '2026-10-08T14:00:00Z' }, { activity_id: null, created_at: '2026-10-10T14:00:00Z' }], ZONE)).toEqual(new Set([LESSON, OTHER]));
  });

  it('an honest day entitles day, lesson and clean-lesson once, keyed by the stamp', () => {
    const rows = [{ achievement_key: 'day_stamp', ref_id: LESSON }];
    expect(earningsOfRows(rows, new Set([LESSON]))).toEqual([
      { reason: 'lesson_completed', refId: LESSON },
      { reason: 'day_completed', refId: LESSON },
      { reason: 'lesson_clean', refId: LESSON },
    ]);
    expect(earningsOfRows(rows, new Set())).toHaveLength(2);
  });

  it('forged input earns nothing: no award rows, no earnings, whatever a body said', () => {
    expect(earningsOfRows([], new Set([LESSON]))).toEqual([]);
    expect(earningsOfRows([{ achievement_key: 'trail_pass', ref_id: LESSON }, { achievement_key: 'weekly_goal', ref_id: LESSON }], new Set([LESSON]))).toEqual([]);
  });

  it('covers trails, streak, invites and podium places', () => {
    const GLOBAL = '00000000-0000-0000-0000-000000000000';
    const rows = [
      { achievement_key: 'trail_complete', ref_id: 'u1' },
      { achievement_key: 'streak_7', ref_id: GLOBAL },
      { achievement_key: 'friend_brought', ref_id: 'friend' },
      { achievement_key: 'invited', ref_id: GLOBAL },
      { achievement_key: 'podium_2', ref_id: 'class1' },
    ];
    expect(earningsOfRows(rows, new Set())).toEqual([
      { reason: 'trail_completed', refId: 'u1' },
      { reason: 'streak_7', refId: GLOBAL },
      { reason: 'invite_friend', refId: 'friend' },
      { reason: 'invited', refId: GLOBAL },
      { reason: 'podium_2', refId: 'class1' },
    ]);
  });

  it('pays what is missing, once: a second pass over the same awards has nothing to pay', () => {
    const entitled = earningsOfRows([{ achievement_key: 'day_stamp', ref_id: LESSON }], new Set([LESSON]));
    expect(missingEarnings(entitled, new Set())).toHaveLength(3);
    expect(missingEarnings(entitled, new Set([`lesson_completed|${LESSON}`, `day_completed|${LESSON}`]))).toEqual([{ reason: 'lesson_clean', refId: LESSON }]);
    expect(missingEarnings(entitled, new Set(entitled.map((entry) => `${entry.reason}|${entry.refId}`)))).toEqual([]);
    expect(missingEarnings([...entitled, ...entitled], new Set())).toHaveLength(3);
  });
});

describe('refunded crystal purchases', () => {
  it('the first attempt keeps the plain key; after a refund the next attempt is a new debit with its own key', () => {
    expect(spendRef('base_estudioso', 'ref', false, '')).toBe('base_estudioso:ref');
    expect(spendRef('base_estudioso', 'ref', false, '', 0)).toBe('base_estudioso:ref');
    const afterRefund = spendRef('base_estudioso', 'ref', false, '', 1);
    expect(afterRefund).not.toBe(spendRef('base_estudioso', 'ref', false, ''));
    expect(spendRef('base_estudioso', 'ref', false, '', 2)).not.toBe(afterRefund);
  });
  it('a consumable never uses the generation', () => {
    expect(spendRef('life', 'ref', true, 'n1', 3)).toBe('life:n1');
  });
});
