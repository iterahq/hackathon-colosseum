import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import PassportPage from '@/pages/PassportPage';
import type { PassportMedal, PassportPageData } from '@/types/achievements';

const view = vi.fn();
vi.mock('@/components/tera/PassportTeras', () => ({ PassportTeras: ({ wallet }: { wallet: string | null }) => <div data-testid="passport-teras" data-wallet={wallet ?? ''} /> }));
vi.mock('@/components/privacy/ProfileVisibilityCard', () => ({ ProfileVisibilityCard: () => <div data-testid="privacy-card" /> }));
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

const three = () => [
  page({ trailId: 'html', trailTitle: 'HTML', daysDone: 2, mintStatus: 'minted', assetAddress: 'Asset1', txSignature: 'sig' }),
  page({ trailId: 'css', trailTitle: 'CSS', daysDone: 0, tier: null, earnedAt: null }),
  page({ trailId: 'js', trailTitle: 'JavaScript', daysDone: 0, tier: null, earnedAt: null, locked: true, lockedBy: 'CSS' }),
];

describe('PassportPage, the certifications list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the hero totals and the no-wallet banner', () => {
    view.mockReturnValue({ ...base, pages: [page()], medals: [medal()] });
    show();
    expect(screen.getByTestId('passport-hero')).toHaveTextContent('1 certificação · 4 carimbos · 1 medalha');
    expect(screen.getByTestId('passport-wallet')).toHaveTextContent('sem carteira');
    expect(screen.getByTestId('passport-no-wallet')).toHaveTextContent('Conecte uma carteira');
  });

  it('lists one card per certification of the program, in program order', () => {
    view.mockReturnValue({ ...base, walletAddress: '7xKpQrstuvwxyz3Fa', pages: three(), medals: [] });
    show();
    const cards = [...screen.getByTestId('certification-list').children];
    expect(cards.map((c) => c.getAttribute('data-state'))).toEqual(['inProgress', 'notStarted', 'locked']);
    expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining('HTML'), expect.stringContaining('CSS'), expect.stringContaining('JavaScript')]);
    expect(screen.queryByTestId('passport-no-wallet')).not.toBeInTheDocument();
  });

  it('the started one shows its progress and opens its own page; the others are grey', () => {
    view.mockReturnValue({ ...base, walletAddress: '7xKpQrstuvwxyz3Fa', pages: three(), medals: [] });
    show();
    const [html, css, js] = [...screen.getByTestId('certification-list').children];
    expect(html).toHaveAttribute('href', '/certifications/html');
    expect(html).toHaveTextContent('2/5 dias');
    expect(html.className.split(' ')).not.toContain('grayscale');
    expect(css).toHaveAttribute('href', '/certifications/css');
    expect(css.className.split(' ')).toContain('grayscale');
    expect(js.tagName).toBe('DIV');
    expect(js.className.split(' ')).toContain('grayscale');
    expect(js).toHaveTextContent('libera após CSS');
  });

  it('carries no chain link and no copy button on the list: the link lives on the certification page', () => {
    view.mockReturnValue({ ...base, walletAddress: '7xKpQrstuvwxyz3Fa', pages: three(), medals: [] });
    show();
    expect(screen.getByTestId('certification-onchain')).toBeInTheDocument();
    expect(screen.queryByTestId('onchain-mark')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="explorer.solana.com"]')).toBeNull();
  });

  it('keeps the medals and leaves the Teras and the claims map out', () => {
    view.mockReturnValue({ ...base, walletAddress: '7xKpQrstuvwxyz3Fa', pages: three(), medals: [medal()] });
    show();
    expect(screen.getByTestId('medal-shelf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Medalhas' })).toBeInTheDocument();
    expect(screen.queryByTestId('passport-teras')).not.toBeInTheDocument();
    expect(screen.queryByTestId('passport-graph')).not.toBeInTheDocument();
  });

  it('nothing earned: every certification is there, grey', () => {
    view.mockReturnValue({ ...base, totals: { pages: 0, stamps: 0, pending: 0, held: 0, medals: 0 }, pages: [page({ daysDone: 0 })], medals: [] });
    show();
    expect(screen.getByTestId('certification-card')).toHaveAttribute('data-state', 'notStarted');
    expect(screen.getByTestId('certification-card')).toHaveTextContent('por começar');
  });

  it('loading: the Tera loader', () => {
    view.mockReturnValue({ ...base, pages: [], medals: [], isPending: true });
    show();
    expect(screen.getByTestId('passport-loading')).toBeInTheDocument();
  });
});
