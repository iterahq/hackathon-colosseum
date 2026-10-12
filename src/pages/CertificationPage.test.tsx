import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import CertificationPage from '@/pages/CertificationPage';
import type { PassportPageData } from '@/types/achievements';

const view = vi.fn();
vi.mock('@/components/header/AppTopBar', () => ({ AppTopBar: () => <div data-testid="top-bar" /> }));
vi.mock('@/components/passport/CertificationClaims', () => ({
  CertificationClaims: ({ wallet, title, position }: { wallet: string | null; title: string; position: number }) => <div data-testid="certification-claims" data-wallet={wallet ?? ''} data-title={title} data-position={position} />,
}));
vi.mock('@/components/wallet/LinkWalletButton', () => ({ LinkWalletButton: () => <button type="button" data-testid="link-wallet" /> }));
vi.mock('@/hooks/usePassportView', () => ({ usePassportView: () => view() }));

const page = (over: Partial<PassportPageData> = {}): PassportPageData => ({
  credentialId: null, trailId: 'html', trailTitle: 'HTML', colorIndex: 1, daysDone: 2, daysAwarded: 2, daysStamped: 2, totalDays: 5, tier: 'bronze', mintStatus: 'minted',
  assetAddress: 'Asset1', txSignature: 'sig', earnedAt: '2026-10-09T10:00:00Z', locked: false, lockedBy: null, ...over,
});
const base = { medals: [{ key: 'm', title: 'Streak 3' }], walletAddress: '7xKpQrstuvwxyz3Fa', isPending: false, isError: false, refetch: vi.fn() };

function show(path = '/certifications/css') {
  localStorage.setItem('itera.locale', 'en');
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/certifications/:trailId" element={<CertificationPage />} />
          <Route path="/certifications" element={<p>the list</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('CertificationPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('puts the certificate first and the claims map of that certification after it', () => {
    view.mockReturnValue({ ...base, pages: [page(), page({ trailId: 'css', trailTitle: 'CSS', assetAddress: 'Asset2' })] });
    show();
    const hero = screen.getByTestId('certification-hero');
    const claims = screen.getByTestId('certification-claims');
    expect(hero).toHaveTextContent('CSS');
    expect(hero.compareDocumentPosition(claims) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(claims).toHaveAttribute('data-title', 'CSS');
    expect(claims).toHaveAttribute('data-position', '1');
    expect(claims).toHaveAttribute('data-wallet', '7xKpQrstuvwxyz3Fa');
  });

  it('has exactly one link to the chain: the asset on the Solana explorer, in a new tab', () => {
    view.mockReturnValue({ ...base, pages: [page()] });
    show('/certifications/html');
    const links = [...document.querySelectorAll('a[href*="explorer.solana.com"]')];
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://explorer.solana.com/address/Asset1?cluster=devnet');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveTextContent('View on Solana Explorer');
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });

  it('shows no medals and no list of the other certifications', () => {
    view.mockReturnValue({ ...base, pages: [page(), page({ trailId: 'css', trailTitle: 'CSS' })] });
    show('/certifications/html');
    expect(screen.queryByTestId('medal-shelf')).not.toBeInTheDocument();
    expect(screen.queryByTestId('passport-medal')).not.toBeInTheDocument();
    expect(screen.queryByText('CSS')).not.toBeInTheDocument();
    expect(screen.getByTestId('certification-back')).toHaveAttribute('href', '/certifications');
  });

  it('a certification not on chain yet says how it gets there instead of a dead link', () => {
    view.mockReturnValue({ ...base, pages: [page({ daysDone: 0, daysStamped: 0, mintStatus: 'unclaimed', assetAddress: null, txSignature: null })] });
    show('/certifications/html');
    expect(document.querySelector('a[href*="explorer.solana.com"]')).toBeNull();
    expect(screen.getByTestId('certification-not-onchain')).toBeInTheDocument();
    expect(screen.getByTestId('certification-start')).toHaveAttribute('href', '/');
  });

  it('offers to link a wallet when the account has none', () => {
    view.mockReturnValue({ ...base, walletAddress: null, pages: [page({ mintStatus: 'unclaimed', assetAddress: null })] });
    show('/certifications/html');
    expect(screen.getByTestId('link-wallet')).toBeInTheDocument();
  });

  it('an unknown certification goes back to the list', () => {
    view.mockReturnValue({ ...base, pages: [page()] });
    show('/certifications/nope');
    expect(screen.getByText('the list')).toBeInTheDocument();
  });

  it('waits for the data before deciding the certification does not exist', () => {
    view.mockReturnValue({ ...base, pages: [], isPending: true });
    show('/certifications/html');
    expect(screen.getByTestId('certification-loading')).toBeInTheDocument();
  });
});
