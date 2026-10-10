import { describe, expect, it } from 'vitest';
import {
  EARN_RULES,
  LIFE_PRICE,
  earnAmount,
  earnRulesView,
  earnsForAward,
  equipRequest,
  equipVerdict,
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
];

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
    expect(pricesOf(CATALOG)).toEqual({ bg_midnight: 75, icon_gold: 75, outfit_crown: 150, life: LIFE_PRICE });
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
    expect(themeOf(CATALOG, {}, new Set())).toEqual({ background: { key: 'bg_obsidian', color: '#0A0908' }, icon: { key: 'icon_green', color: '#3FD17F' } });
  });

  it('wears what the learner chose and owns', () => {
    const theme = themeOf(CATALOG, { background: 'bg_midnight', icon: 'icon_gold' }, new Set(['bg_midnight']));
    expect(theme.background).toEqual({ key: 'bg_midnight', color: '#0B1020' });
    // Chosen but not owned (any more): back to the default.
    expect(theme.icon.key).toBe('icon_green');
  });

  it('still answers with a theme when the catalog is empty', () => {
    expect(themeOf([], { background: 'bg_midnight' }, new Set())).toEqual({ background: { key: 'bg_obsidian', color: '#0A0908' }, icon: { key: 'icon_green', color: '#3FD17F' } });
  });

  it('lets anyone equip a default, an owner equip a bought one, and nobody cross the kinds', () => {
    const byKey = (key: string) => CATALOG.find((entry) => entry.key === key);
    expect(equipVerdict('background', byKey('bg_obsidian'), new Set())).toBe('ok');
    expect(equipVerdict('background', byKey('bg_midnight'), new Set())).toBe('not_owned');
    expect(equipVerdict('background', byKey('bg_midnight'), new Set(['bg_midnight']))).toBe('ok');
    expect(equipVerdict('background', byKey('icon_gold'), new Set(['icon_gold']))).toBe('unknown_item');
    expect(equipVerdict('icon', byKey('outfit_crown'), new Set(['outfit_crown']))).toBe('unknown_item');
    expect(equipVerdict('icon', undefined, new Set())).toBe('unknown_item');
  });

  it('reads the slots of an equip body, flat or under `equip`', () => {
    expect(equipRequest({ background: 'bg_midnight' })).toEqual({ background: 'bg_midnight' });
    expect(equipRequest({ equip: { icon: 'icon_gold', background: 'bg_grape' } })).toEqual({ icon: 'icon_gold', background: 'bg_grape' });
    expect(equipRequest({})).toBeNull();
    expect(equipRequest({ background: 7 })).toBeNull();
    expect(equipRequest({ icon: '' })).toBeNull();
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
