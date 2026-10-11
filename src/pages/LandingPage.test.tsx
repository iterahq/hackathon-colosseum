import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LandingPage from './LandingPage';
import { EXAMPLE_WALLET } from '@/components/landing/landingStyles';

const data = vi.hoisted(() => ({
  board: {
    isPending: false,
    isError: false,
    data: { stats: { openCount: 4, lockedSol: '0.28 SOL', paidCount: 1, paidSol: '0.005 SOL', rehearsalPaidCount: 1, outsidePaidCount: 0 }, bounties: [], readAt: '2026-10-11T14:05:00Z' },
  } as Record<string, unknown>,
  circuit: {
    isPending: false,
    isError: false,
    data: { stampsFunded: 3465, stampsIssued: 276, purchases: 29, sharePercent: 50, stampFeeLamports: 5000, asOf: '2026-10-11T14:06:00Z', shop: { minUsdCents: 20, maxUsdCents: 1000, items: 40 } },
  } as Record<string, unknown>,
  profile: {
    isPending: false,
    data: {
      status: 'ok',
      profile: {
        wallet: 'CHJBdsVLj3ZUJSRWc2EkxXFfG2nU98dUx5Gam94kGfya',
        avatar: { imageUrl: '/a.webp' },
        certifications: [{ trail: 'Week 1 · HTML', daysDone: 5, totalDays: 5, tier: 'gold', verified: true }],
        capabilities: { verifiedCount: 4, total: 28 },
        medals: [{}, {}],
      },
    },
  } as Record<string, unknown>,
}));
vi.mock('@/hooks/useBounties', () => ({ useBountyBoard: () => data.board }));
vi.mock('@/hooks/useCircuit', () => ({ useCircuit: () => data.circuit }));
vi.mock('@/hooks/useLearnerProfile', () => ({ useLearnerProfile: () => data.profile }));

function mount(locale: 'pt' | 'en') {
  localStorage.setItem('itera.locale', locale);
  return render(
    <I18nProvider>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('LandingPage', () => {
  it('states the thesis, both CTAs and the live numbers in English', () => {
    mount('en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Learn.Prove.Earn.');
    expect(screen.getByTestId('landing-cta-wallet')).toHaveAttribute('href', '/login');
    expect(screen.getByTestId('landing-cta-profile')).toHaveAttribute('href', `/u/${EXAMPLE_WALLET}`);
    expect(screen.getAllByTestId('landing-step')).toHaveLength(3);
    const stats = screen.getAllByTestId('landing-stat').map((s) => s.textContent);
    expect(stats).toEqual([
      '4open bounties',
      '0.28 SOLin escrow',
      '1bounty paid0 to outside learners · 1 team rehearsal',
      '276stamps written on chainnetwork fee paid by Itera, with help from the shop',
      "29shop purchaseson devnet, the team's test runs included",
    ]);
    expect(screen.getByTestId('landing-live-readat')).toHaveTextContent(/^Read at [^.]*\.$/);
    expect(screen.getByTestId('landing-live')).not.toHaveTextContent(/never go down|capacity/);
    expect(screen.getByTestId('landing-hero-time')).toHaveTextContent('Day 1 takes about 15 minutes');
    expect(screen.getByTestId('landing-hero-bounties')).toHaveAttribute('href', '/bounties');
    expect(screen.getByTestId('landing-live')).not.toHaveTextContent(/left out/);
    expect(screen.getByTestId('landing-lede')).toHaveTextContent('Learn to code in 5-day trails. Each finished day is stamped on a credential in your wallet. That credential unlocks paid work.');
    expect(screen.getByTestId('landing-hero')).not.toHaveTextContent(/soulbound|Metaplex|escrow|evidence hash/i);
    expect(screen.getByTestId('landing-cta-email')).toHaveAttribute('href', '/signup');
    expect(screen.getByTestId('landing-cta-try')).toHaveAttribute('href', '/try');
    expect(screen.getByTestId('landing-example')).toHaveTextContent('Week 1 · HTML · 5/5 days · gold');
    expect(screen.getByTestId('landing-example')).toHaveTextContent('4 of 28 capabilities verified on chain · 2 medals');
    expect(screen.getByTestId('landing-example')).toHaveTextContent('Verified on chain');
    localStorage.clear();
  });

  it('tells a stranger who it is for, who pays and who built it, with no invented number', () => {
    mount('en');
    expect(screen.getByTestId('landing-story')).toHaveTextContent('People learning to code from zero');
    expect(screen.getByTestId('landing-story')).toHaveTextContent('people who never wrote code');
    expect(screen.getByTestId('landing-story')).not.toHaveTextContent(/production|cohort/);
    expect(screen.getByTestId('landing-model')).toHaveTextContent('Itera pays the network fee of every stamp');
    expect(screen.getByTestId('landing-model')).not.toHaveTextContent(/Stripe|subscription|lives/);
    expect(screen.getByTestId('landing-model')).toHaveTextContent("Itera's server moves half of each purchase, in a public transfer");
    expect(screen.getByTestId('landing-steps')).toHaveTextContent('the program on chain reads them from the credential in your wallet before it lets you accept.');
    expect(screen.getByTestId('landing-model-build')).toHaveTextContent('no real money moves');
    const team = screen.getByTestId('landing-team-member').textContent ?? '';
    expect(team).toContain('Samuel Stefano');
    expect(team).toContain('Tainan Fidelis');
    expect(screen.getByTestId('landing-team')).not.toHaveTextContent(/\d+ (students|learners|followers|years)/);
    expect(screen.queryByTestId('landing-pitch-video')).toBeNull();
    expect(screen.getByTestId('landing-verify')).toHaveAttribute('href', '/verify');
    localStorage.clear();
  });

  it('speaks Portuguese when the locale is pt', () => {
    mount('pt');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Aprenda.Prove.Ganhe.');
    expect(screen.getByTestId('landing-cta-wallet')).toHaveTextContent('Entrar com carteira');
    localStorage.clear();
  });

  it('shows no number when a read fails and hides the example when the profile is missing', () => {
    data.board = { isPending: false, isError: true, data: undefined };
    data.circuit = { isPending: false, isError: true, data: undefined };
    data.profile = { isPending: false, data: { status: 'invalid' } };
    mount('en');
    expect(screen.queryAllByTestId('landing-stat')).toHaveLength(0);
    expect(screen.queryByTestId('landing-example')).toBeNull();
    expect(screen.getByText('No reading right now.')).toBeInTheDocument();
    localStorage.clear();
  });
});
