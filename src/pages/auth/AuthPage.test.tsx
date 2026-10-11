import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import AuthPage from './AuthPage';

const auth = vi.hoisted(() => ({
  session: null,
  loading: false,
  signInWithPassword: vi.fn(),
  signInWithSolana: vi.fn(async () => ({ error: null })),
  configured: true,
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/auth/dflFederation', () => ({ loginWithDfl: vi.fn() }));
const wallets = vi.hoisted(() => ({ list: [] as { id: string; name: string; provider: object }[], mobile: false }));
vi.mock('@/utils/solanaWallets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/solanaWallets')>()),
  detectInjectedWallets: () => wallets.list,
  isMobileBrowser: () => wallets.mobile,
}));

function mount() {
  localStorage.setItem('itera.locale', 'en');
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  wallets.list = [];
  wallets.mobile = false;
  auth.signInWithSolana.mockClear();
});

describe('AuthPage', () => {
  it('keeps the submit and DFL buttons at least 44 px tall', () => {
    mount();
    expect(screen.getByTestId('submit-login').className).toContain('min-h-11');
    expect(screen.getByTestId('oauth-dfl').className).toContain('min-h-11');
  });

  it('greets a newcomer with the wallet, not "welcome back"', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Enter Itera');
    expect(screen.queryByText(/welcome back/i)).toBeNull();
    expect(screen.getByTestId('other-ways')).toHaveTextContent('For DevFellowship members');
  });

  it('tells a desktop browser without a wallet how to install one', () => {
    mount();
    expect(screen.getByTestId('no-wallet')).toHaveTextContent('No Solana wallet in this browser');
    expect(screen.getByTestId('install-phantom')).toHaveAttribute('href', 'https://phantom.app/download');
    expect(screen.queryByTestId('open-in-phantom')).toBeNull();
    expect(screen.queryByTestId('web3-solana')).toBeNull();
    expect(screen.getByTestId('goto-signup')).toHaveAttribute('href', '/signup');
    expect(screen.getByTestId('goto-signup').className).toContain('bg-evergreen');
    expect(screen.getByTestId('other-ways')).toHaveAttribute('open');
  });

  it('offers the Phantom in-app browser on a phone', () => {
    wallets.mobile = true;
    mount();
    expect(screen.getByTestId('open-in-phantom').getAttribute('href')).toMatch(/^https:\/\/phantom\.app\/ul\/browse\//);
    expect(screen.getByTestId('no-wallet')).toHaveTextContent("inside the Phantom app's browser");
    const card = screen.getByTestId('no-wallet');
    const order = [...card.querySelectorAll('a')].map((a) => a.getAttribute('data-testid'));
    expect(order.slice(0, 2)).toEqual(['open-in-phantom', 'goto-signup']);
    expect(screen.queryByTestId('web3-solana')).toBeNull();
    expect(screen.queryByText(/Continue with Phantom/)).toBeNull();
  });

  it('lists every injected wallet and signs in through the one clicked', async () => {
    const solflare = { signMessage: async () => new Uint8Array() };
    wallets.list = [
      { id: 'phantom', name: 'Phantom', provider: { signMessage: async () => new Uint8Array() } },
      { id: 'solflare', name: 'Solflare', provider: solflare },
    ];
    mount();
    expect(screen.getByTestId('web3-solana')).toHaveTextContent('Continue with Phantom');
    expect(screen.getByTestId('goto-signup')).toHaveAttribute('href', '/signup');
    expect(screen.getByTestId('other-ways')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByTestId('web3-solana-solflare'));
    await waitFor(() => expect(auth.signInWithSolana).toHaveBeenCalledWith(solflare));
  });
});
