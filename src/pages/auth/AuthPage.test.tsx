import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import AuthPage from './AuthPage';

const auth = vi.hoisted(() => ({
  session: null,
  loading: false,
  signInWithPassword: vi.fn(),
  signInWithSolana: vi.fn(async () => ({ error: null as string | null })),
  configured: true,
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));
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

const phantom = { id: 'phantom', name: 'Phantom', provider: { signMessage: async () => new Uint8Array() } };

beforeEach(() => {
  wallets.list = [];
  wallets.mobile = false;
  auth.signInWithSolana.mockClear();
  auth.signInWithSolana.mockResolvedValue({ error: null });
});

describe('AuthPage', () => {
  it('shows one Connect Wallet button and the Tera art, nothing else to choose', () => {
    wallets.list = [phantom];
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Enter Itera');
    expect(screen.getByTestId('web3-solana')).toHaveTextContent('Connect Wallet');
    expect(screen.getByTestId('web3-solana').className).toContain('min-h-14');
    expect(screen.getByTestId('login-art')).toHaveAttribute('src', '/mascot/tera-hero.webp');
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual(['web3-solana', 'locale-toggle']);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('offers no e-mail, password or DevFellowship sign-in and never names devfellowship', () => {
    wallets.list = [phantom];
    mount();
    for (const id of ['login-form', 'email-input', 'password-input', 'submit-login', 'oauth-dfl', 'other-ways', 'goto-signup', 'try-first-lesson']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('login-page').textContent).not.toMatch(/devfellowship|DFL|e-?mail/i);
  });

  it('signs in through Phantom, ignoring any other injected wallet', async () => {
    wallets.list = [{ id: 'solflare', name: 'Solflare', provider: { signMessage: async () => new Uint8Array() } }, phantom];
    mount();
    expect(screen.queryByTestId('web3-solana-solflare')).toBeNull();
    fireEvent.click(screen.getByTestId('web3-solana'));
    await waitFor(() => expect(auth.signInWithSolana).toHaveBeenCalledWith(phantom.provider));
  });

  it('says so when the wallet refuses', async () => {
    wallets.list = [phantom];
    auth.signInWithSolana.mockResolvedValue({ error: 'User rejected the request.' });
    mount();
    fireEvent.click(screen.getByTestId('web3-solana'));
    expect(await screen.findByTestId('wallet-error')).toHaveTextContent('Could not sign in with the wallet. Try again.');
  });

  it('sends a desktop browser without Phantom to the install page', () => {
    mount();
    expect(screen.getByTestId('install-phantom')).toHaveAttribute('href', 'https://phantom.app/download');
    expect(screen.getByTestId('install-phantom')).toHaveTextContent('Install Phantom');
    expect(screen.queryByTestId('open-in-phantom')).toBeNull();
    expect(screen.queryByTestId('web3-solana')).toBeNull();
  });

  it('offers the Phantom in-app browser on a phone', () => {
    wallets.mobile = true;
    mount();
    expect(screen.getByTestId('open-in-phantom').getAttribute('href')).toMatch(/^https:\/\/phantom\.app\/ul\/browse\//);
    expect(screen.queryByTestId('install-phantom')).toBeNull();
    expect(screen.queryByTestId('web3-solana')).toBeNull();
  });

  it('does not treat a wallet that is not Phantom as a way in', () => {
    wallets.list = [{ id: 'solflare', name: 'Solflare', provider: { signMessage: async () => new Uint8Array() } }];
    mount();
    expect(screen.queryByTestId('web3-solana')).toBeNull();
    expect(screen.getByTestId('install-phantom')).toBeInTheDocument();
  });
});
