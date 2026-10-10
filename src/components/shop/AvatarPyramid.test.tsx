import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { toShopItems } from '@/services/shopNormalize';
import { mockAvatarItems } from '@/services/shopMockAvatars';
import type { ShopActions } from '@/types/shopView';
import { AvatarPyramid } from './AvatarPyramid';

const items = toShopItems(mockAvatarItems('pt', { owned: ['base_lider'], avatar: 'tera_feliz', asset: 'Asset1' })).map((i) => (i.avatar?.free ? { ...i, owned: true } : i));
const actions = (): ShopActions => ({ busy: false, hasWallet: true, buy: vi.fn(), claim: vi.fn(), equip: vi.fn(), unequip: vi.fn(), tryOn: vi.fn() });
const tile = (key: string) => document.querySelector<HTMLElement>(`[data-testid="avatar-tile"][data-item="${key}"]`) as HTMLElement;

describe('AvatarPyramid', () => {
  it('draws one row per rarity from the rarest down, with name, label, supply and the price', () => {
    render(<I18nProvider><AvatarPyramid items={items} actions={actions()} /></I18nProvider>);
    const tiers = screen.getAllByTestId('avatar-tier');
    expect(tiers.map((t) => t.dataset.rarity)).toEqual(['primordial', 'mythic', 'legendary', 'epic', 'rare', 'common']);
    expect(tiers[1]).toHaveTextContent('Tera Mítico');
    expect(within(tiers[1]).getByTestId('avatar-tier-supply')).toHaveTextContent('8/15 emitidos');
    expect(within(tiers[1]).getByTestId('avatar-tier-price')).toHaveTextContent('US$ 1000.00');
    expect(within(tiers[3]).getByTestId('avatar-tier-crystals')).toHaveTextContent('2 500 cristais');
    expect(within(tiers[5]).getByTestId('avatar-tier-supply')).toHaveTextContent('ilimitado');
    expect(screen.getByTestId('avatar-free')).toHaveTextContent('Ícones grátis');
  });

  it('shows every state: buy, sold out, out of season, owned, equipped and free', () => {
    render(<I18nProvider><AvatarPyramid items={items} actions={actions()} /></I18nProvider>);
    expect(tile('event_space').dataset.state).toBe('buy');
    expect(tile('special_arco_iris').dataset.state).toBe('soldout');
    expect(within(tile('special_arco_iris')).getByTestId('avatar-action')).toBeDisabled();
    expect(tile('event_natal').dataset.season).toBe('out');
    expect(within(tile('event_natal')).getByTestId('avatar-action')).toBeDisabled();
    expect(within(tile('event_natal')).getByTestId('avatar-state')).toHaveTextContent(/Volta em dez/i);
    expect(tile('base_lider').dataset.state).toBe('owned');
    expect(tile('tera_feliz').dataset.state).toBe('equipped');
    expect(tile('tera_normal').dataset.state).toBe('free');
  });

  it('says what an avatar includes', () => {
    render(<I18nProvider><AvatarPyramid items={items} actions={actions()} /></I18nProvider>);
    expect(within(tile('event_verao')).getByTestId('avatar-includes')).toHaveTextContent('Inclui: borda do Caju · óculos');
    expect(within(tile('special_preto_cosmico')).getByTestId('avatar-includes')).toHaveTextContent('Inclui: borda do Nulo');
  });

  it('one action per tile, and the portrait opens the try-on', () => {
    const a = actions();
    render(<I18nProvider><AvatarPyramid items={items} actions={a} /></I18nProvider>);
    fireEvent.click(within(tile('event_space')).getByTestId('avatar-action'));
    expect(a.buy).toHaveBeenCalledWith(expect.objectContaining({ key: 'event_space' }));
    fireEvent.click(within(tile('base_lider')).getByTestId('avatar-action'));
    expect(a.equip).toHaveBeenCalledWith(expect.objectContaining({ key: 'base_lider' }));
    fireEvent.click(within(tile('event_space')).getByTestId('avatar-tryon'));
    expect(a.tryOn).toHaveBeenCalledWith(expect.objectContaining({ key: 'event_space' }));
  });
});
