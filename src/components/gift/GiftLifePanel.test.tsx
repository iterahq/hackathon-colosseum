import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { PURCHASE_IDLE } from '@/utils/purchaseMachine';
import { GiftLifePanel } from './GiftLifePanel';

const RECIPIENT = 'BNCkAhpDgLhzncCYNTnENCzRZDvo2iLPdUSMm89qBoqH';
const ME = '2rAa7WJMQ4KXDWyT7HPmrWqB1XUwLwj9JSRwC8misnqA';
const buy = vi.fn();
const auth = vi.fn();
const companion = vi.fn();

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth() }));
vi.mock('@/hooks/useCompanion', () => ({ useCompanion: () => companion() }));
vi.mock('@/hooks/useGift', () => ({ useGiftPrice: () => ({ data: { priceLabel: 'US$ 0.10 ≈ 0.00055 SOL', priceLamports: 550000 } }) }));
vi.mock('@/hooks/usePurchase', () => ({ usePurchase: () => ({ state: PURCHASE_IDLE, busy: false, buy, fund: vi.fn(), retry: vi.fn(), reset: vi.fn() }) }));
vi.mock('@/hooks/usePassportSound', () => ({ usePassportSound: () => vi.fn() }));

const show = (wallet = RECIPIENT) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <GiftLifePanel wallet={wallet} />
      </MemoryRouter>
    </I18nProvider>
  );

describe('GiftLifePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockReturnValue({ session: { user: { id: 'u1' } } });
    companion.mockReturnValue({ wallet: ME, outfit: null, isPending: false });
  });

  it('a signed-in wallet gifts through the purchase flow with the recipient', () => {
    show();
    const button = screen.getByTestId('gift-button');
    expect(button.textContent).toContain('US$ 0.10 ≈ 0.00055 SOL');
    fireEvent.click(button);
    expect(buy).toHaveBeenCalledWith('life_gift', undefined, RECIPIENT);
  });

  it('always offers the blink link, which carries the action for this recipient on devnet', () => {
    show();
    const blink = new URL(screen.getByTestId('gift-blink').getAttribute('href') ?? '');
    expect(blink.origin).toBe('https://dial.to');
    expect(blink.searchParams.get('action')).toContain(`action-gift?to=${RECIPIENT}`);
    expect(blink.searchParams.get('cluster')).toBe('devnet');
  });

  it('the owner of the profile cannot gift themselves and is told to share the link', () => {
    show(ME);
    expect(screen.queryByTestId('gift-button')).toBeNull();
    expect(screen.getByTestId('gift-hint').textContent).toMatch(/Compartilhe|Share/);
  });

  it('a visitor without a session is sent to sign in; an account without a wallet cannot pay', () => {
    auth.mockReturnValue({ session: null });
    companion.mockReturnValue({ wallet: null, outfit: null, isPending: false });
    const { unmount } = show();
    expect(screen.getByTestId('gift-sign-in').getAttribute('href')).toBe('/login');
    expect(screen.queryByTestId('gift-button')).toBeNull();
    unmount();
    auth.mockReturnValue({ session: { user: { id: 'u1' } } });
    show();
    expect(screen.getByTestId('gift-button')).toHaveProperty('disabled', true);
  });
});
