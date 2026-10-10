import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { toShopItems } from '@/services/shopNormalize';
import type { ItemAction } from '@/types/shopView';
import { CrystalNotice, CrystalPayProvider, PayButtons } from './CrystalPay';

const item = (extra: Record<string, unknown> = {}) => toShopItems([{ key: 'outfit_crown', kind: 'outfit', title: 'Crown', price_usd_cents: 30, price_lamports: 1650000, price_crystals: 150, ...extra }])[0];
const action = (run = vi.fn()): ItemAction => ({ id: 'buy', label: 'Comprar', run, disabled: false, primary: true });
const show = (it: ReturnType<typeof item>, pay: ((i: unknown, ref?: string) => void) | null, run = vi.fn(), labels: 'full' | 'short' = 'full') =>
  render(
    <I18nProvider>
      <CrystalPayProvider value={pay ? { onPayWithCrystals: pay, busy: false, refId: 'trail-1' } : null}>
        <PayButtons item={it} action={action(run)} testId="k" labels={labels} walletLabel="Comprar" />
      </CrystalPayProvider>
    </I18nProvider>
  );

describe('PayButtons', () => {
  it('draws both pay actions side by side and wires each one', () => {
    const pay = vi.fn();
    const run = vi.fn();
    const it = item();
    show(it, pay, run);
    expect(screen.getByTestId('k')).toHaveTextContent('Pagar com a wallet · US$ 0.30');
    expect(screen.getByTestId('k-crystals')).toHaveTextContent('Pagar com cristais · 150');
    fireEvent.click(screen.getByTestId('k'));
    fireEvent.click(screen.getByTestId('k-crystals'));
    expect(run).toHaveBeenCalled();
    expect(pay).toHaveBeenCalledWith(it, 'trail-1');
  });

  it('keeps today\'s single key when there is no crystal price or no crystal wiring', () => {
    show(item({ price_crystals: null }), vi.fn());
    expect(screen.getByTestId('k')).toHaveTextContent('Comprar');
    expect(screen.queryByTestId('k-crystals')).toBeNull();
  });

  it('draws only the crystal key when the wallet is off, and only the wallet key when crystals are off', () => {
    const { unmount } = show(item({ sol_enabled: false }), vi.fn());
    expect(screen.queryByTestId('k')).toBeNull();
    expect(screen.getByTestId('k-crystals')).toBeInTheDocument();
    unmount();
    show(item({ crystals_enabled: false }), vi.fn());
    expect(screen.getByTestId('k')).toHaveTextContent('Comprar');
    expect(screen.queryByTestId('k-crystals')).toBeNull();
  });
});

describe('CrystalNotice', () => {
  it('says the balance against the price', () => {
    render(<I18nProvider><CrystalNotice failure={{ code: 'insufficient_crystals', itemKey: 'x', price: 150, balance: 40 }} onClose={() => {}} /></I18nProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent('você tem 40 e o preço é 150');
  });
});
