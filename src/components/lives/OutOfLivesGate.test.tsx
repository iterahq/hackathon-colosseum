import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { OutOfLivesGate } from './OutOfLivesGate';

const show = (chainUrl?: string | null) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <OutOfLivesGate lives={{ current: 0, max: 5 }} secondsToNext={1194} priceLabel="US$ 0.10" hasWallet outfit={null} chainUrl={chainUrl} busy={false} onRefill={vi.fn()} onConnect={vi.fn()} onLeave={vi.fn()} />
      </MemoryRouter>
    </I18nProvider>
  );

describe('OutOfLivesGate', () => {
  it('has one primary, the rule line and a wait link', () => {
    show();
    expect(screen.getByTestId('lives-gate-refill')).toHaveTextContent('US$ 0.10');
    expect(screen.getByTestId('lives-rule')).toHaveTextContent('de graça');
    expect(screen.getByTestId('lives-gate-wait')).toHaveTextContent('Esperar 19:54');
    expect(screen.queryByTestId('lives-gate-chain')).not.toBeInTheDocument();
  });

  it('links the on-chain Tera when a url is known', () => {
    show('https://explorer.solana.com/tx/abc?cluster=devnet');
    expect(screen.getByTestId('lives-gate-chain')).toHaveTextContent('Seu Tera on-chain: 0/5 vidas');
    expect(screen.getByTestId('lives-gate-chain')).toHaveAttribute('href', 'https://explorer.solana.com/tx/abc?cluster=devnet');
  });
});
