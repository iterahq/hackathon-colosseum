import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { CircuitStrip } from '@/components/shop/CircuitStrip';
import type { CircuitCounter } from '@/types/circuit';

const getCircuit = vi.fn<(wallet: string | null) => Promise<CircuitCounter>>();
vi.mock('@/services/circuit.service', () => ({ getCircuit: (wallet: string | null) => getCircuit(wallet) }));

const counter = (over: Partial<CircuitCounter> = {}): CircuitCounter => ({ lamports: 1_100_000, stampsFunded: 220, purchases: 2, treasuryExplorerUrl: 'https://explorer.solana.com/address/T?cluster=devnet', authorityExplorerUrl: null, wallet: null, ...over });

const show = (wallet: string | null) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nProvider>
        <CircuitStrip wallet={wallet} />
      </I18nProvider>
    </QueryClientProvider>
  );

describe('CircuitStrip', () => {
  beforeEach(() => {
    getCircuit.mockReset();
  });

  it('says what the learner paid forward and what the shop paid in total, with the explorer link', async () => {
    getCircuit.mockResolvedValue(counter({ wallet: { lamports: 550_000, stampsFunded: 110 } }));
    show('WALLET');
    const strip = await screen.findByTestId('circuit-strip');
    expect(getCircuit).toHaveBeenCalledWith('WALLET');
    expect(strip).toHaveTextContent('Suas compras já pagaram 110 carimbos de outros alunos');
    expect(strip).toHaveTextContent('no total a loja pagou 220');
    expect(screen.getByTestId('circuit-explorer')).toHaveAttribute('href', 'https://explorer.solana.com/address/T?cluster=devnet');
    expect(strip).toHaveTextContent('taxa de rede dos carimbos');
  });

  it('does not claim stamps for a learner who bought nothing', async () => {
    getCircuit.mockResolvedValue(counter({ wallet: { lamports: 0, stampsFunded: 0 } }));
    show('WALLET');
    const strip = await screen.findByTestId('circuit-strip');
    expect(strip).toHaveTextContent('Cada compra sua paga carimbos de outros alunos');
    expect(strip).not.toHaveTextContent('já pagaram');
  });

  it('shows nothing when the counter cannot be read', async () => {
    getCircuit.mockRejectedValue(new Error('down'));
    show(null);
    await vi.waitFor(() => expect(getCircuit).toHaveBeenCalled());
    expect(screen.queryByTestId('circuit-strip')).toBeNull();
  });
});
