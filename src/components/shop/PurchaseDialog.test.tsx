import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { PURCHASE_IDLE, type PurchaseState } from '@/utils/purchaseMachine';

const show = (state: PurchaseState, kind: 'life' | 'outfit' | 'ink' = 'life') =>
  render(
    <I18nProvider>
      <PurchaseDialog state={state} itemTitle="Refill" itemKind={kind} outfit={null} onRetry={vi.fn()} onFund={vi.fn()} onClose={vi.fn()} />
    </I18nProvider>
  );

describe('PurchaseDialog', () => {
  it('paid: payment row links its own signature, the on-chain row links the mirror', () => {
    show({
      ...PURCHASE_IDLE,
      phase: 'paid',
      explorerUrl: 'https://explorer.solana.com/tx/PAY?cluster=devnet',
      proof: {
        signature: 'abcdefgh0123456789uvwxyz',
        chain: { signature: 'mirror0123456789mirror99', explorerUrl: 'https://explorer.solana.com/tx/MIRROR?cluster=devnet' },
        imageUrl: 'https://x.test/a.svg?v=2',
        written: [{ attribute: 'lives', value: '5' }],
        lives: { current: 5, max: 5 },
      },
    });
    expect(screen.getByTestId('purchase-explorer')).toHaveTextContent('abcdefgh…uvwxyz');
    expect(screen.getByTestId('purchase-explorer')).toHaveAttribute('href', 'https://explorer.solana.com/tx/PAY?cluster=devnet');
    expect(screen.getByTestId('purchase-explorer-row')).toHaveTextContent('Pagamento');
    expect(screen.getByTestId('purchase-chain-explorer')).toHaveAttribute('href', 'https://explorer.solana.com/tx/MIRROR?cluster=devnet');
    expect(screen.getByTestId('purchase-chain-explorer-row')).toHaveTextContent('Gravado on-chain');
    expect(screen.getByTestId('purchase-dialog')).toHaveTextContent('Vidas recarregadas: 5/5');
    expect(screen.getByTestId('purchase-change')).toHaveTextContent('Gravado no seu Tera on-chain.');
    expect(screen.getByTestId('purchase-art')).toHaveAttribute('src', 'https://x.test/a.svg?v=2');
  });

  it('paid without a chain write: no on-chain row', () => {
    show({ ...PURCHASE_IDLE, phase: 'paid', explorerUrl: null, proof: { signature: 'abcdefgh0123456789uvwxyz', imageUrl: null, written: [], lives: null } }, 'outfit');
    expect(screen.queryByTestId('purchase-chain-explorer')).not.toBeInTheDocument();
    expect(screen.getByTestId('purchase-dialog')).toHaveTextContent('Você comprou: Refill. Equipe para o seu Tera usar.');
  });

  it('insufficient: friendly amount, no technical details', () => {
    show({ ...PURCHASE_IDLE, phase: 'insufficient', detail: 'purchase-intent: insufficient_funds', neededLamports: 1_445_880 });
    expect(screen.getByTestId('purchase-dialog')).toHaveTextContent('cerca de 0.00145 SOL');
    expect(screen.queryByTestId('purchase-details')).not.toBeInTheDocument();
    expect(screen.getByTestId('purchase-faucet')).toBeInTheDocument();
  });

  it('insufficient on a showcase piece: calm line, no faucet', () => {
    show({ ...PURCHASE_IDLE, phase: 'insufficient', detail: 'purchase-intent: insufficient_funds', neededLamports: 5_500_000_000 });
    expect(screen.queryByTestId('purchase-faucet')).not.toBeInTheDocument();
    expect(screen.getByTestId('purchase-dialog')).toHaveTextContent('vitrine');
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

  it('paid: says how many stamps of other learners the purchase paid for, only when the backend confirmed it', () => {
    const paid = { ...PURCHASE_IDLE, phase: 'paid' as const, explorerUrl: null };
    const { unmount } = show({ ...paid, proof: { signature: 'abcdefgh0123456789uvwxyz', imageUrl: null, written: [], lives: null, circuitStamps: 110 } }, 'outfit');
    expect(screen.getByTestId('purchase-circuit')).toHaveTextContent('+110 carimbos pagos pra outros alunos');
    unmount();
    show({ ...paid, proof: { signature: 'abcdefgh0123456789uvwxyz', imageUrl: null, written: [], lives: null, circuitStamps: null } }, 'outfit');
    expect(screen.queryByTestId('purchase-circuit')).not.toBeInTheDocument();
  });
});
