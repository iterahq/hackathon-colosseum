import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { PURCHASE_IDLE, type PurchaseState } from '@/utils/purchaseMachine';

const show = (state: PurchaseState, kind: 'life' | 'outfit' = 'life') =>
  render(
    <I18nProvider>
      <PurchaseDialog state={state} itemTitle="Refill" itemKind={kind} outfit={null} onRetry={vi.fn()} onFund={vi.fn()} onClose={vi.fn()} />
    </I18nProvider>
  );

describe('PurchaseDialog', () => {
  it('paid: short signature, what changed and the refreshed art', () => {
    show({
      ...PURCHASE_IDLE,
      phase: 'paid',
      explorerUrl: 'https://explorer.solana.com/tx/SIG?cluster=devnet',
      proof: { signature: 'abcdefgh0123456789uvwxyz', imageUrl: 'https://x.test/a.svg?v=2', written: [], lives: { current: 5, max: 5 } },
    });
    expect(screen.getByTestId('purchase-explorer')).toHaveTextContent('abcdefgh…uvwxyz');
    expect(screen.getByTestId('purchase-explorer')).toHaveAttribute('href', 'https://explorer.solana.com/tx/SIG?cluster=devnet');
    expect(screen.getByTestId('purchase-change')).toHaveTextContent('vidas 5/5 gravadas no seu Tera');
    expect(screen.getByTestId('purchase-art')).toHaveAttribute('src', 'https://x.test/a.svg?v=2');
  });

  it('paid without proof: no art and no change line', () => {
    show({ ...PURCHASE_IDLE, phase: 'paid', explorerUrl: null });
    expect(screen.queryByTestId('purchase-art')).not.toBeInTheDocument();
    expect(screen.queryByTestId('purchase-change')).not.toBeInTheDocument();
  });

  it('failed: raw text sits behind a technical details disclosure', () => {
    show({ ...PURCHASE_IDLE, phase: 'failed', detail: '-32603 Blockhash not found' });
    const box = screen.getByTestId('purchase-details');
    expect(box.tagName).toBe('DETAILS');
    expect(box).not.toHaveAttribute('open');
    expect(box).toHaveTextContent('Detalhes técnicos');
    expect(screen.getByTestId('purchase-detail')).toHaveTextContent('-32603 Blockhash not found');
  });
});
