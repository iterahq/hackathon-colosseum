import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import PassportPage from '@/pages/PassportPage';
import type { PassportMedal, PassportPageData } from '@/types/achievements';

const view = vi.fn();
vi.mock('@/components/tera/PassportTeras', () => ({ PassportTeras: ({ wallet }: { wallet: string | null }) => <div data-testid="passport-teras" data-wallet={wallet ?? ''} /> }));
vi.mock('@/components/talent/TalentOptIn', () => ({ TalentOptIn: () => <div data-testid="talent-optin" /> }));
vi.mock('@/components/graph/PassportGraph', () => ({ PassportGraph: ({ wallet }: { wallet: string | null }) => <div data-testid="passport-graph" data-wallet={wallet ?? ''} /> }));
vi.mock('@/hooks/usePassportView', () => ({ usePassportView: () => view() }));
vi.mock('@/hooks/useContent', () => ({ useUserStats: () => ({ data: { totalXp: 780, completedActivities: 20 } }) }));
vi.mock('@/hooks/useWalletLink', () => ({ useWalletLink: () => ({ wallet: null, linked: false, pending: false, userId: 'u' }) }));
vi.mock('@/hooks/useLoopView', () => ({ useLoopView: () => ({ status: 'no-wallet', view: null, capabilities: null, learner: null, retry: () => undefined }) }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => ({ data: [] }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { displayName: 'Sam' } }) }));
vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => ({ level: 'member' }) }));
vi.mock('@/hooks/useVideoCourses', () => ({ useVideoCourses: () => ({ courses: [] }) }));
vi.mock('@/hooks/useTrailDashboard', () => ({ useTrailDashboard: () => ({ trails: [], featured: null }) }));
vi.mock('@/hooks/useAchievements', () => ({ useAchievements: () => ({ items: [], earnedCount: 0, isPending: false }) }));
vi.mock('@/hooks/useLiveClass', () => ({ useEnabledTenantIds: () => ({ data: [] }) }));
vi.mock('@/hooks/useCompanion', () => ({ useCompanion: () => ({ data: undefined }) }));
vi.mock('@/hooks/useCrystals', () => ({ useCrystals: () => ({ data: undefined }) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { email: 'a@b.c' }, signOut: vi.fn(), signInWithSolana: vi.fn() }) }));

const page = (over: Partial<PassportPageData> = {}): PassportPageData => ({
  credentialId: null, trailId: 't1', trailTitle: 'HTML', colorIndex: 1, daysDone: 4, daysAwarded: over.daysDone ?? 4, daysStamped: over.daysDone ?? 4, totalDays: 5, tier: 'bronze', mintStatus: 'unclaimed',
  assetAddress: null, txSignature: null, earnedAt: '2026-10-09T10:00:00Z', locked: false, lockedBy: null, ...over,
});
const medal = (over: Partial<PassportMedal> = {}): PassportMedal => ({ key: 'm', kind: 'streak', credentialId: 'row-m', title: 'Streak 3', description: '3 dias seguidos', glyph: 'D3', earned: true, mintStatus: 'unclaimed', assetAddress: null, txSignature: null, ...over });
const base = { earnedCount: 3, heldLessonId: null, totals: { pages: 1, stamps: 4, pending: 0, held: 0, medals: 1 }, featuredId: 't1', walletAddress: null, isPending: false, isError: false, refetch: vi.fn() };

const show = () => render(<I18nProvider><MemoryRouter><PassportPage /></MemoryRouter></I18nProvider>);

describe('PassportPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the hero totals, the no-wallet banner and a page with its facts', () => {
    view.mockReturnValue({ ...base, pages: [page()], medals: [medal()] });
    show();
    expect(screen.getByTestId('passport-hero')).toHaveTextContent('1 certificação · 4 carimbos · 1 medalha');
    expect(screen.getByTestId('passport-wallet')).toHaveTextContent('sem carteira');
    expect(screen.getByTestId('passport-no-wallet')).toHaveTextContent('Conecte uma carteira');
    expect(screen.getByTestId('passport-full-card')).toHaveTextContent('09/10/2026');
  });

  it('offers the talent opt-in card to the signed-in learner', () => {
    view.mockReturnValue({ ...base, pages: [page()], medals: [] });
    show();
    expect(screen.getByTestId('talent-optin')).toBeInTheDocument();
  });

  it('minted pages get the on-chain mark and a public link button; gold ones come first', () => {
    view.mockReturnValue({
      ...base,
      walletAddress: '7xKpQrstuvwxyz3Fa',
      pages: [page({ trailId: 'a', trailTitle: 'CSS', daysDone: 2 }), page({ trailId: 'b', trailTitle: 'HTML', daysDone: 5, mintStatus: 'minted', assetAddress: 'Asset1', txSignature: 'sig' })],
      medals: [],
    });
    show();
    expect(screen.getAllByTestId('passport-full-card')[0]).toHaveTextContent('HTML');
    expect(screen.getByTestId('onchain-mark')).toHaveAttribute('href', expect.stringContaining('/tx/sig'));
    expect(screen.getByRole('button', { name: /Copiar link público/ })).toBeInTheDocument();
    expect(screen.queryByTestId('passport-no-wallet')).not.toBeInTheDocument();
  });

  it('mounts the capability graph with the learner wallet', () => {
    view.mockReturnValue({ ...base, walletAddress: '7xKpQrstuvwxyz3Fa', pages: [page()], medals: [] });
    show();
    expect(screen.getByTestId('passport-graph')).toHaveAttribute('data-wallet', '7xKpQrstuvwxyz3Fa');
    expect(screen.getByTestId('passport-teras')).toHaveAttribute('data-wallet', '7xKpQrstuvwxyz3Fa');
  });

  it('nothing earned: one empty page and the way to day 1', () => {
    view.mockReturnValue({ ...base, totals: { pages: 0, stamps: 0, medals: 0 }, pages: [page({ daysDone: 0 })], medals: [] });
    show();
    expect(screen.getByTestId('passport-empty')).toHaveTextContent('Complete o dia 1 e o Tera carimba aqui.');
    expect(screen.getByRole('button', { name: 'Ir pro dia 1' })).toBeInTheDocument();
  });

  it('loading: the Tera loader', () => {
    view.mockReturnValue({ ...base, pages: [], medals: [], isPending: true });
    show();
    expect(screen.getByTestId('passport-loading')).toBeInTheDocument();
  });
});
