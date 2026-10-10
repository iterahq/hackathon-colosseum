import { describe, expect, it } from 'vitest';
import { toBorder, toCrystals, toSpend, toTheme } from '@/services/crystalsNormalize';
import { DEFAULT_THEME } from '@/types/crystals';

describe('crystalsNormalize', () => {
  it('reads the live GET /crystals answer', () => {
    const snap = toCrystals(
      {
        balance: 20,
        explorer_url: 'https://explorer.solana.com/address/x?cluster=devnet',
        prices: { bg_midnight: 75, life: 5, junk: 'x' },
        earn_rules: [{ reason: 'lesson_completed', crystals: 2, label: 'Lição concluída' }, { crystals: 1 }],
        ledger: [{ id: 'a', delta: -75, reason: 'spend', ref_id: 'bg_ember:0', created_at: '2026-10-10T07:13:00Z' }],
        theme: { background: { key: 'bg_ember', color: '#1A0C0C' }, icon: { key: 'icon_green', color: '#3FD17F' } },
        theme_items: [
          { key: 'bg_midnight', slot: 'background', color: '#0B1020', title: 'Fundo Meia-noite', price_crystals: 75, default: false, owned: false, equipped: false },
          { key: 'weird', slot: 'nope' },
        ],
      },
      false
    );
    expect(snap.balance).toBe(20);
    expect(snap.prices).toEqual({ bg_midnight: 75, life: 5 });
    expect(snap.earnRules).toHaveLength(1);
    expect(snap.ledger[0]).toMatchObject({ id: 'a', delta: -75, refId: 'bg_ember:0' });
    expect(snap.theme.background.color).toBe('#1A0C0C');
    expect(snap.theme.border).toBeNull();
    expect(snap.themeItems).toHaveLength(1);
    expect(snap.themeItems[0]).toMatchObject({ key: 'bg_midnight', priceCrystals: 75, forSale: true, includedWith: null });
  });

  it('falls back to the default theme when the block is missing or broken', () => {
    expect(toTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(toTheme({ background: { key: 'x', color: 'red' } }).background).toEqual(DEFAULT_THEME.background);
  });

  it('parses borders tolerantly', () => {
    expect(toBorder({ style: 'conic', colors: ['#fff', 'bad', '#000'], glow: true, animated: true })).toEqual({ style: 'conic', colors: ['#fff', '#000'], glow: true, animated: true });
    expect(toBorder({ style: 'zigzag', colors: ['#fff'] })?.style).toBe('solid');
    expect(toBorder({ style: 'solid', colors: [] })).toBeNull();
    expect(toBorder(null)).toBeNull();
    const t = toTheme({ border: { key: 'border_sol', title: 'Sol', border: { style: 'gradient', colors: ['#F5B301'], glow: true, animated: false } } });
    expect(t.border?.border?.style).toBe('gradient');
  });

  it('reads a border item for sale and a signature one', () => {
    const snap = toCrystals({ theme_items: [
      { key: 'border_bronze', slot: 'border', title: 'Bronze', price_crystals: 100, owned: true, for_sale: true, border: { style: 'solid', colors: ['#CD7F32'] } },
      { key: 'border_sol', slot: 'border', title: 'Sol', price_crystals: null, for_sale: false, included_with: 'special_dourado', effect: { border: { style: 'gradient', colors: ['#F5B301'] } } },
    ] }, false);
    expect(snap.themeItems[0].forSale).toBe(true);
    expect(snap.themeItems[1]).toMatchObject({ forSale: false, includedWith: 'special_dourado' });
    expect(snap.themeItems[1].border?.style).toBe('gradient');
  });

  it('reads a spend answer', () => {
    expect(toSpend({ balance: 95, item: { key: 'life' } }, 'life')).toEqual({ balance: 95, itemKey: 'life', theme: null });
  });
});
