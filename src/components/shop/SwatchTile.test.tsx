import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { toShopItems } from '@/services/shopNormalize';
import { DEFAULT_AVATAR } from '@/types/avatar';
import type { ShopActions } from '@/types/shopView';
import { ShopBordersSlot } from './ShopBordersSlot';

const actions = (): ShopActions => ({ busy: false, hasWallet: true, buy: vi.fn(), claim: vi.fn(), equip: vi.fn(), unequip: vi.fn(), tryOn: vi.fn() });
const items = toShopItems([
  { key: 'border_bronze', kind: 'border', title: 'Bronze', price_usd_cents: 20, price_lamports: 1, effect: { border: { style: 'solid', colors: ['#B07A4A'], glow: false, animated: false } } },
  { key: 'border_sol', kind: 'border', title: 'Sol border', for_sale: false, included_with: 'special_dourado', effect: { border: { style: 'gradient', colors: ['#F2C66D', '#fff'], glow: true, animated: false } } },
  { key: 'bg_midnight', kind: 'background', title: 'Midnight', owned: true, effect: { color: '#14182E' } },
]);

describe('ShopBordersSlot', () => {
  it('renders nothing without items', () => {
    const { container } = render(<I18nProvider><ShopBordersSlot items={[]} actions={actions()} avatar={DEFAULT_AVATAR} /></I18nProvider>);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws a ring for a border and a chip for a background, says what comes with an avatar', () => {
    render(<I18nProvider><ShopBordersSlot items={items} actions={actions()} avatar={DEFAULT_AVATAR} /></I18nProvider>);
    expect(screen.getAllByTestId('swatch-ring')).toHaveLength(2);
    expect(screen.getByTestId('swatch-chip')).toBeInTheDocument();
    expect(screen.getByTestId('swatch-included')).toHaveTextContent('Vem com');
    expect(screen.getByTestId('shop-buy')).toBeInTheDocument();
    expect(screen.getByTestId('swatch-state')).toHaveTextContent('Seu');
  });
});
