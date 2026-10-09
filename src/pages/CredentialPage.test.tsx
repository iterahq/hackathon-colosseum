import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import CredentialPage from '@/pages/CredentialPage';
import type { CredentialLookup } from '@/types/achievements';
import { parseCredential } from '@/services/credential.service';

const useCredential = vi.fn();
vi.mock('@/hooks/useCredential', () => ({ useCredential: (a: string, l: string) => useCredential(a, l) }));

const verified = (over = {}): CredentialLookup => ({
  status: 'verified',
  ms: 412,
  data: parseCredential(
    { verified: true, owner: '7xKpQrstuvwxyz3Fa', frozen: true, attributes: [{ key: 'days_done', value: '2' }], achievement: { key: 'trail_pass', tier: 'bronze', title: 'Passport', state: { total_days: 5 }, stamps: [{ day: 1 }, { day: 2 }] }, minted_at: '2026-10-09T10:00:00Z', ...over },
    'Asset1111111111'
  ),
});

function show(path = '/c/Asset1111111111') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/c/:asset" element={<CredentialPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('CredentialPage (public)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loading: skeleton and the reading caption', () => {
    useCredential.mockReturnValue({ isPending: true, isError: false });
    show();
    expect(screen.getByTestId('credential-loading')).toHaveTextContent('Lendo a chain…');
  });

  it('verified: the verdict, the facts, the timing and the explorer link', () => {
    useCredential.mockReturnValue({ isPending: false, isError: false, data: verified() });
    show();
    const card = screen.getByTestId('credential-card');
    expect(card).toHaveAttribute('data-status', 'verified');
    expect(card).toHaveTextContent('✓ Verificado na Solana');
    expect(card).toHaveTextContent('2/5');
    expect(card).toHaveTextContent('lido da chain em 412 ms');
    expect(screen.getByRole('link', { name: /Ver na Solana Explorer/ })).toHaveAttribute('href', 'https://explorer.solana.com/address/Asset1111111111?cluster=devnet');
    expect(screen.getByRole('link', { name: 'Quero meu passaporte' })).toHaveAttribute('href', '/');
  });

  it('unverified: amber warning, no verified title', () => {
    useCredential.mockReturnValue({ isPending: false, isError: false, data: { ...verified({ verified: false, achievement: null }), status: 'unverified' } });
    show();
    expect(screen.getByTestId('credential-card')).toHaveTextContent('Este asset não foi emitido pela Itera.');
    expect(screen.queryByText('✓ Verificado na Solana')).not.toBeInTheDocument();
  });

  it('not found: says so and lets the visitor check another address', () => {
    useCredential.mockReturnValue({ isPending: false, isError: false, data: { status: 'not_found', ms: 20 } });
    show();
    expect(screen.getByTestId('credential-not-found')).toHaveTextContent('Nenhum asset neste endereço.');
    fireEvent.change(screen.getByLabelText('Endereço do asset'), { target: { value: 'Other' } });
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument();
  });

  it('failed: retry', () => {
    const refetch = vi.fn();
    useCredential.mockReturnValue({ isPending: false, isError: true, refetch });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
