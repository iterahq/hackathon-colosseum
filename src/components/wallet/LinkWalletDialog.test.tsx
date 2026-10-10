import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { LinkState } from '@/hooks/useLinkWallet';
import { LinkWalletDialog } from './LinkWalletDialog';

const hook = vi.fn();
vi.mock('@/hooks/useLinkWallet', async (orig) => ({ ...(await orig<typeof import('@/hooks/useLinkWallet')>()), useLinkWallet: () => hook() }));

const show = (state: Partial<LinkState>) => {
  hook.mockReturnValue({ state: { phase: 'idle', wallet: null, remaining: null, code: null, ...state }, start: vi.fn(), reset: vi.fn() });
  render(<I18nProvider><LinkWalletDialog onClose={vi.fn()} /></I18nProvider>);
};

beforeEach(() => vi.clearAllMocks());

describe('LinkWalletDialog', () => {
  it('explains the signature in one line before starting', () => {
    show({});
    expect(screen.getByRole('dialog')).toHaveTextContent('Não é uma transação e não custa nada.');
    expect(screen.getByTestId('link-wallet-start')).toBeInTheDocument();
  });

  it('shows how many certifications are left to write', () => {
    show({ phase: 'minting', remaining: 3 });
    expect(screen.getByRole('dialog')).toHaveTextContent('3 restantes');
  });

  it('links to Phantom when no wallet is installed', () => {
    show({ phase: 'no_wallet' });
    expect(screen.getByTestId('link-wallet-install')).toHaveAttribute('href', 'https://phantom.app');
  });

  it('gives each backend error its own line, and no retry when it is final', () => {
    show({ phase: 'error', code: 'wallet_in_use' });
    expect(screen.getByRole('dialog')).toHaveTextContent('já pertence a outra conta');
    expect(screen.getByTestId('link-wallet-retry')).toBeInTheDocument();
  });

  it('final errors offer no retry', () => {
    show({ phase: 'error', code: 'already_linked' });
    expect(screen.queryByTestId('link-wallet-retry')).not.toBeInTheDocument();
  });

  it('done shows the short address and the explorer link', () => {
    show({ phase: 'done', wallet: '7xKpQrstuvwxyzABCDEFGH3Fa' });
    expect(screen.getByTestId('link-wallet-address')).toHaveTextContent('7xKp…3Fa');
    expect(screen.getByText(/ver no explorer/)).toHaveAttribute('href', expect.stringContaining('explorer.solana.com/address/'));
  });
});
