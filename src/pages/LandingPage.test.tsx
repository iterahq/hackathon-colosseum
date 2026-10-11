import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LandingPage from './LandingPage';
import { EXAMPLE_WALLET } from '@/components/landing/landingStyles';

const data = vi.hoisted(() => ({
  board: { isPending: false, isError: false, data: { stats: { openCount: 4, lockedSol: '0.28 SOL', paidCount: 1, paidSol: '0.005 SOL' }, bounties: [] } } as Record<string, unknown>,
  circuit: { isPending: false, isError: false, data: { stampsFunded: 3465, purchases: 29 } } as Record<string, unknown>,
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
    expect(stats).toEqual(['4open bounties', '0.28 SOLin escrow', '1bounties paid', '3,465stamps paid for by shop purchases', '29real shop purchases']);
    expect(screen.getByTestId('landing-example')).toHaveTextContent('Week 1 · HTML · 5/5 days · gold');
    expect(screen.getByTestId('landing-example')).toHaveTextContent('4 of 28 capabilities verified on chain · 2 medals');
    expect(screen.getByTestId('landing-example')).toHaveTextContent('Verified on chain');
    localStorage.clear();
  });

  it('tells a stranger who it is for, who pays and who built it, with no invented number', () => {
    mount('en');
    expect(screen.getByTestId('landing-story')).toHaveTextContent('People learning to code from zero');
    expect(screen.getByTestId('landing-story')).toHaveTextContent('Educar+ institute in Rio de Janeiro');
    expect(screen.getByTestId('landing-model')).toHaveTextContent('Stripe, live since September 2026');
    expect(screen.getByTestId('landing-model')).toHaveTextContent('nothing is charged today');
    expect(screen.getByTestId('landing-model-build')).toHaveTextContent('no real money moves');
    const members = screen.getAllByTestId('landing-team-member').map((m) => m.textContent);
    expect(members[0]).toContain('Samuel Stefano');
    expect(members[1]).toContain('Tainan Fidelis');
    expect(screen.getByTestId('landing-team')).not.toHaveTextContent(/\d+ (students|learners|followers|years)/);
    expect(screen.queryByTestId('landing-pitch-video')).toBeNull();
    expect(screen.queryByTestId('landing-verify')).toBeNull();
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
