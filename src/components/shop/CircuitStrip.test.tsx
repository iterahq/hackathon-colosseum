import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { CircuitStrip } from '@/components/shop/CircuitStrip';
import type { CircuitCounter } from '@/types/circuit';

const getCircuit = vi.fn<(wallet: string | null) => Promise<CircuitCounter>>();
vi.mock('@/services/circuit.service', () => ({ getCircuit: (wallet: string | null) => getCircuit(wallet) }));

const counter = (over: Partial<CircuitCounter> = {}): CircuitCounter => ({ lamports: 1_100_000, stampsFunded: 220, purchases: 2, asOf: null, purchaseLamports: 2_200_000, sharePercent: 50, stampFeeLamports: 5000, outside: null, shop: null, treasury: 'T', authority: null, treasuryExplorerUrl: 'https://explorer.solana.com/address/T?cluster=devnet', authorityExplorerUrl: null, stampsIssued: null, wallet: null, ...over });

const show = (wallet: string | null, compact = false) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nProvider>
        <CircuitStrip wallet={wallet} compact={compact} />
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
    expect(strip).toHaveTextContent('Suas compras já cobrem até 110 carimbos de outros alunos');
    expect(strip).toHaveTextContent('no total a loja já cobre até 220');
    expect(screen.getByTestId('circuit-explorer')).toHaveAttribute('href', 'https://explorer.solana.com/address/T?cluster=devnet');
    expect(strip).toHaveTextContent('taxa de rede dos carimbos');
  });

  it('does not claim stamps for a learner who bought nothing', async () => {
    getCircuit.mockResolvedValue(counter({ wallet: { lamports: 0, stampsFunded: 0 } }));
    show('WALLET');
    const strip = await screen.findByTestId('circuit-strip');
    expect(strip).toHaveTextContent('Cada compra sua paga carimbos de outros alunos');
    expect(strip).not.toHaveTextContent('já cobrem');
  });

  it('shows nothing when the counter cannot be read', async () => {
    getCircuit.mockRejectedValue(new Error('down'));
    show(null);
    await vi.waitFor(() => expect(getCircuit).toHaveBeenCalled());
    expect(screen.queryByTestId('circuit-strip')).toBeNull();
  });

  it('with the paid shelf off it is one chip that links to the chain proof and keeps the sentence for a tooltip and a screen reader', async () => {
    getCircuit.mockResolvedValue(counter({ wallet: { lamports: 0, stampsFunded: 0 } }));
    show('WALLET', true);
    const chip = await screen.findByTestId('circuit-strip');
    expect(chip).toHaveAttribute('data-compact', 'true');
    expect(chip.tagName).toBe('A');
    expect(chip).toHaveAttribute('href', 'https://explorer.solana.com/address/T?cluster=devnet');
    expect(chip).toHaveAttribute('title', expect.stringContaining('220'));
    expect(chip).toHaveTextContent('Circuito');
  });

  it('the chip is plain text when there is no address to link', async () => {
    getCircuit.mockResolvedValue(counter({ treasuryExplorerUrl: null }));
    show(null, true);
    const chip = await screen.findByTestId('circuit-strip');
    expect(chip.tagName).toBe('SPAN');
  });
});
