import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { toShopItems } from '@/services/shopNormalize';
import type { ShopActions } from '@/types/shopView';
import { LifePacks, bestValueKey } from './LifePacks';

const pack = (key: string, cents: number, effect: Record<string, number>) => ({ key, kind: 'life', title: key, price_usd_cents: cents, price_lamports: 1, effect });
const items = toShopItems([pack('lives_10', 30, { add_lives: 10 }), pack('lives_30', 80, { add_lives: 30 }), pack('lives_100', 200, { add_lives: 100 }), pack('lives_infinite', 1000, { unlimited_days: 30 }), { key: 'life_refill', kind: 'life', title: 'Refill', price_usd_cents: 20, price_lamports: 1 }]);
const actions = (): ShopActions => ({ busy: false, hasWallet: true, buy: vi.fn(), claim: vi.fn(), equip: vi.fn(), unequip: vi.fn(), tryOn: vi.fn() });
const card = (key: string) => document.querySelector<HTMLElement>(`[data-testid="shop-item"][data-item="${key}"]`) as HTMLElement;

describe('LifePacks', () => {
  it('tags the cheapest pack per life', () => {
    expect(bestValueKey(items)).toBe('lives_100');
    render(<I18nProvider><LifePacks items={items} actions={actions()} full={false} /></I18nProvider>);
    expect(screen.getAllByTestId('life-pack-best')).toHaveLength(1);
    expect(within(card('lives_100')).getByTestId('life-pack-best')).toBeInTheDocument();
    expect(within(card('lives_10')).getByTestId('life-pack-per')).toHaveTextContent('US$ 0.030 por vida');
    expect(card('lives_infinite')).toHaveTextContent('30 dias');
  });

  it('keeps packs buyable at full lives, but not the refill', () => {
    const a = actions();
    render(<I18nProvider><LifePacks items={items} actions={a} full /></I18nProvider>);
    fireEvent.click(within(card('lives_10')).getByTestId('shop-buy'));
    expect(a.buy).toHaveBeenCalledWith(expect.objectContaining({ key: 'lives_10' }));
    expect(within(card('life_refill')).getByTestId('shop-buy')).toBeDisabled();
  });
});
