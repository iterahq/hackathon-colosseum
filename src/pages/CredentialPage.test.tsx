import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import CredentialPage from '@/pages/CredentialPage';
import type { CredentialLookup } from '@/types/achievements';
import { parseCredential } from '@/services/credential.service';

const readAccount = vi.fn();
vi.mock('@/lib/chain/rpc', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/chain/rpc')>()), readAccount: (...args: unknown[]) => readAccount(...args) }));

const useCredential = vi.fn();
vi.mock('@/hooks/useCredential', () => ({ useCredential: (a: string, l: string) => useCredential(a, l), useRecheckCredential: () => ({ mutate: vi.fn(), isPending: false }) }));

const verified = (over = {}): CredentialLookup => ({
  status: 'verified',
  ms: 412,
  data: parseCredential(
    { verified: true, owner: '7xKpQrstuvwxyz3Fa', frozen: true, attributes: [{ key: 'days_done', value: '2' }], achievement: { key: 'trail_pass', tier: 'bronze', title: 'Passport', state: { total_days: 5 }, stamps: [{ day: 1 }, { day: 2 }] }, minted_at: '2026-10-09T10:00:00Z', ...over },
    'Asset1111111111'
  ),
});

function show(path = '/c/Asset1111111111') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/c/:asset" element={<CredentialPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>
  );
}

describe('CredentialPage (public)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAccount.mockResolvedValue(null);
  });

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
    expect(screen.getByRole('link', { name: 'Quero minha certificação' })).toHaveAttribute('href', '/');
  });

  it('verified: reads the asset account from the chain on its own, below the card', async () => {
    useCredential.mockReturnValue({ isPending: false, isError: false, data: verified() });
    show();
    expect(screen.getByTestId('read-without-itera')).toHaveTextContent('não do servidor da Itera');
    expect(await screen.findByText(/Este endereço não tem conta na devnet/)).toBeInTheDocument();
    expect(readAccount).toHaveBeenCalledTimes(1);
    expect(readAccount.mock.calls[0][0]).toBe('Asset1111111111');
    expect(screen.getByRole('link', { name: /O que dura/ })).toHaveAttribute('href', '/verify#durable');
  });

  it('companion: lives, outfit, level, xp, streak and the art; no trail rows', () => {
    const companion = verified({ attributes: [{ key: 'streak', value: '3' }], achievement: { key: 'companion', title: 'Tera', image_url: 'https://x.test/img.svg', state: { lives: 3, max_lives: 5, outfit: 'outfit_crown', level: 4, xp: 780 }, stamps: [] } });
    useCredential.mockReturnValue({ isPending: false, isError: false, data: companion });
    show();
    const card = screen.getByTestId('credential-card');
    expect(card).toHaveTextContent('Vidas3/5');
    expect(card).toHaveTextContent('Coroa');
    expect(card).toHaveTextContent('Nível4');
    expect(card).toHaveTextContent('Sequência3');
    expect(card).toHaveTextContent('Intransferívelsim');
    expect(screen.getByTestId('credential-companion-art')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('Trilha');
  });

  it('unverified: amber warning, no verified title', () => {
    useCredential.mockReturnValue({ isPending: false, isError: false, data: { ...verified({ verified: false, achievement: null }), status: 'unverified' } });
    show();
    expect(screen.getByTestId('credential-card')).toHaveTextContent('Este asset não foi emitido pela Itera.');
    expect(screen.queryByText('✓ Verificado na Solana')).not.toBeInTheDocument();
    expect(screen.getByTestId('credential-tera')).toHaveTextContent('O Tera não reconhece este asset.');
    expect(screen.queryByTestId('passport-page')).not.toBeInTheDocument();
  });

  it('not found: says so and lets the visitor check another address', () => {
    useCredential.mockReturnValue({ isPending: false, isError: false, data: { status: 'not_found', ms: 20 } });
    show();
    expect(screen.getByTestId('credential-not-found')).toHaveTextContent('Não existe credencial da Itera neste endereço.');
    expect(screen.getByTestId('credential-not-found')).toHaveTextContent('O Tera não achou nada neste endereço.');
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
