/**
 * The web host of the learner home: the trails dashboard. The data hooks are mocked and the REAL page
 * renders, so what is asserted is what a learner sees and what each control does.
 *
 * Visitor mode (2026-09-18): a signed-in user with no active subscription reaches "/" and sees the visitor
 * banner and the course carousel, and the member reads (trails, stats, achievements) are never made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import HomeRoute from '@/pages/HomeRoute';
import type { AchievementView } from '@/types/achievements';
import type { SourceProgram } from '@/types/trailDashboard';
import { buildTrails, pickFeatured } from '@/utils/trailDashboard';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const useAccessLevel = vi.fn();
const useTrailDashboard = vi.fn();
const useUserStats = vi.fn();
const useAchievements = vi.fn();
const useCatalog = vi.fn();
const useActiveLiveClass = vi.fn();
const useNextScheduledClass = vi.fn();
const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));

vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => useAccessLevel() }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/hooks/useTrailDashboard', () => ({ useTrailDashboard: (...a: unknown[]) => useTrailDashboard(...a) }));
vi.mock('@/hooks/useContent', () => ({ useUserStats: (...a: unknown[]) => useUserStats(...a) }));
vi.mock('@/hooks/useAchievements', () => ({ useAchievements: (...a: unknown[]) => useAchievements(...a) }));
vi.mock('@/hooks/useCatalog', () => ({ useCatalog: (...a: unknown[]) => useCatalog(...a) }));
vi.mock('@/hooks/useLiveClass', () => ({
  useActiveLiveClass: () => useActiveLiveClass(),
  useNextScheduledClass: () => useNextScheduledClass(),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({ useIteraIdentity: () => ({ userId: 'u1' }) }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => ({ data: [] }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { displayName: 'Sam Doe' } }) }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'learner@itera.dev' }, session: null, configured: true, signOut: vi.fn() }),
}));

const FORBIDDEN = /assin|plano|preço|R\$|cri(ar|e) (sua |minha )?conta|cadastr|subscri|trial|sign ?up|pagamento/i;

const tree: SourceProgram = {
  id: 'p1',
  slug: 'itera-v2',
  title: { pt: 'Itera v2' },
  createdAt: '2026-01-01T00:00:00Z',
  units: [
    {
      id: 'u-html',
      ordinal: 0,
      title: { pt: 'Semana 1 · HTML' },
      lessons: [
        { id: 'l1', ordinal: 0, title: { pt: 'Dia 1 — Página nasce' }, activityIds: ['a1', 'a2'] },
        { id: 'l2', ordinal: 1, title: { pt: 'Dia 2 — Tag dentro de tag' }, activityIds: ['a3'] },
      ],
    },
    { id: 'u-css', ordinal: 1, title: { pt: 'Semana 2 · CSS' }, lessons: [{ id: 'l3', ordinal: 0, title: { pt: 'Dia 1 — Cor' }, activityIds: ['a4'] }] },
  ],
};

const done = (activityId: string) => ({ activityId, status: 'completed', completedAt: '2026-10-08T10:00:00Z' });

function dashboard(progress = [done('a1')], over: Record<string, unknown> = {}) {
  const trails = buildTrails([tree], progress);
  return { trails, featured: pickFeatured(trails), weekly: progress.length, isPending: false, isError: false, refetch: vi.fn(), ...over };
}

const course = {
  id: 'c1',
  tenantId: 't',
  tenantSlug: 'itera',
  slug: 'fundamentos-web',
  title: { pt: 'Fundamentos da Web' },
  createdAt: '2020-01-01T00:00:00Z',
  unitCount: 1,
  lessonCount: 3,
  activityCount: 9,
  alreadyEnrolled: false,
};

const achievement = (over: Partial<AchievementView> = {}): AchievementView => ({
  key: 'day-1',
  kind: 'day',
  tier: null,
  title: { pt: 'Primeira tag' },
  description: { pt: 'Dia 1 de HTML' },
  art: {},
  sort: 1,
  earned: null,
  ...over,
});

const refetchCatalog = vi.fn();
const member = () => useAccessLevel.mockReturnValue({ level: 'member', entitlementError: false });
const visitor = () => useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <I18nProvider>
        <HomeRoute />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  surface.value = 'web';
  useTrailDashboard.mockReturnValue(dashboard());
  useUserStats.mockReturnValue({ data: { totalXp: 120, streakDays: 1, badgeCount: 0, completedActivities: 7 }, isPending: false });
  useAchievements.mockReturnValue({ items: [], earnedCount: 0, isPending: false, isError: false, refetch: vi.fn() });
  useCatalog.mockReturnValue({ data: [], isPending: false, isError: false, refetch: refetchCatalog });
  useActiveLiveClass.mockReturnValue({ data: null });
  useNextScheduledClass.mockReturnValue({ data: null });
});

describe('HomeRoute: a member', () => {
  beforeEach(member);

  it('draws the top bar with the counts and makes the member reads', () => {
    renderHome();
    expect(screen.getByText('120 XP · 0 conquistas · 7 atividades')).toBeInTheDocument();
    expect(useTrailDashboard).toHaveBeenCalledWith({ enabled: true });
    expect(useUserStats).toHaveBeenCalledWith({ enabled: true });
    expect(useAchievements).toHaveBeenCalledWith({ enabled: true });
  });

  it('the featured trail shows the current day and Continue opens that lesson', () => {
    renderHome();
    const hero = screen.getByTestId('featured-trail');
    expect(hero).toHaveTextContent('HTML · Itera v2');
    expect(hero).toHaveTextContent('> hoje · dia 01 de 2');
    expect(hero).toHaveTextContent('Página nasce');
    expect(hero).toHaveTextContent('1 de 3 atividades');
    fireEvent.click(within(hero).getByTestId('featured-continue'));
    expect(navigate).toHaveBeenLastCalledWith('/lesson/l1');
  });

  it('a done day of the path can be reviewed and an upcoming one is not openable', () => {
    useTrailDashboard.mockReturnValue(dashboard([done('a1'), done('a2')]));
    renderHome();
    const hero = within(screen.getByTestId('featured-trail'));
    fireEvent.click(hero.getAllByRole('button', { name: 'Dia 1 · Página nasce' })[0]);
    expect(navigate).toHaveBeenLastCalledWith('/lesson/l1');
  });

  it('the days after the current one are disabled', () => {
    renderHome();
    const upcoming = within(screen.getByTestId('featured-trail')).getAllByRole('button', { name: 'Dia 2 · Tag dentro de tag' });
    expect(upcoming.every((b) => b.hasAttribute('disabled'))).toBe(true);
  });

  it('the other trail is a locked card until the previous one is done', () => {
    renderHome();
    const card = screen.getByTestId('trail-card');
    expect(card).toHaveAttribute('data-status', 'locked');
    expect(card).toBeDisabled();
    expect(card).toHaveTextContent('CSS');
    expect(card).toHaveTextContent('libera após HTML');
    expect(screen.getByTestId('trail-cards')).toHaveTextContent('2 trilhas · 0 concluídas');
  });

  it('a finished trail is a review card with its medal, and the next one opens', () => {
    useTrailDashboard.mockReturnValue(dashboard([done('a1'), done('a2'), done('a3')]));
    renderHome();
    const hero = screen.getByTestId('featured-trail');
    expect(hero).toHaveTextContent('CSS');
    const card = screen.getByTestId('trail-card');
    expect(card).toHaveAttribute('data-status', 'done');
    expect(card).toHaveTextContent('✓ 2/2');
    fireEvent.click(card);
    expect(navigate).toHaveBeenLastCalledWith('/lesson/l1');
  });

  it('the weekly goal counts the last 7 days against 20', () => {
    useTrailDashboard.mockReturnValue(dashboard([done('a1')], { weekly: 9 }));
    renderHome();
    expect(screen.getByTestId('weekly-goal')).toHaveTextContent('9 de 20 atividades');
  });

  it('with an empty achievement catalog the design slots are locked', () => {
    renderHome();
    const slots = screen.getAllByTestId('achievement-slot');
    expect(slots).toHaveLength(9);
    expect(slots.every((s) => s.getAttribute('data-state') === 'locked')).toBe(true);
  });

  it('achievements: earned and locked ones, and the on-chain mark with an explorer link on minted rows only', () => {
    useAchievements.mockReturnValue({
      items: [
        achievement({ earned: { achievementKey: 'day-1', refId: null, earnedAt: '2026-10-08T00:00:00Z', mintStatus: 'minted', assetAddress: 'Asset111', txSignature: 'tx' } }),
        achievement({ key: 'day-2', title: { pt: 'Segunda tag' }, earned: { achievementKey: 'day-2', refId: null, earnedAt: null, mintStatus: 'pending', assetAddress: null, txSignature: null } }),
        achievement({ key: 'trail-1', title: { pt: 'Trilha HTML' } }),
      ],
      earnedCount: 2,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderHome();
    const panel = screen.getByTestId('achievements');
    expect(panel).toHaveTextContent('2 de 3');
    expect(within(panel).getAllByTestId('achievement-slot').map((s) => s.getAttribute('data-state'))).toEqual(['earned', 'earned', 'locked']);
    const mark = within(panel).getByTestId('achievement-onchain');
    expect(within(panel).getAllByTestId('achievement-onchain')).toHaveLength(1);
    expect(mark).toHaveAttribute('href', 'https://explorer.solana.com/address/Asset111?cluster=devnet');
  });

  it('live classes: the empty state, then the class in progress with the way in', () => {
    const { unmount } = renderHome();
    expect(screen.getByTestId('live-empty')).toHaveTextContent('Nenhuma aula agendada por enquanto.');
    unmount();
    useActiveLiveClass.mockReturnValue({ data: { id: 'live-1', instructorId: 'someone-else' } });
    renderHome();
    fireEvent.click(within(screen.getByTestId('live-class-block')).getByTestId('live-class-join'));
    expect(navigate).toHaveBeenLastCalledWith('/live/live-1');
  });

  it('live classes: the next scheduled one is named after its lesson', () => {
    useNextScheduledClass.mockReturnValue({ data: { id: 's1', lessonId: 'l1', instructorId: 'x', scheduledAt: '2026-10-11T13:00:00Z' } });
    renderHome();
    expect(screen.getByTestId('next-scheduled-block')).toHaveTextContent('HTML · Página nasce');
  });

  it('the course carousel lists the catalog and opens the catalog for a course not enrolled', () => {
    useCatalog.mockReturnValue({ data: [course], isPending: false, isError: false, refetch: refetchCatalog });
    renderHome();
    const card = screen.getByTestId('course-card');
    expect(card).toHaveTextContent('Fundamentos da Web');
    expect(card).toHaveTextContent('3 lições · 9 atividades');
    fireEvent.click(card);
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
  });

  it('loading: skeleton blocks and no trail', () => {
    useTrailDashboard.mockReturnValue({ trails: [], featured: null, weekly: 0, isPending: true, isError: false, refetch: vi.fn() });
    renderHome();
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('featured-trail')).not.toBeInTheDocument();
  });

  it('error: the message, and Retry reads the trails again', () => {
    const refetch = vi.fn();
    useTrailDashboard.mockReturnValue({ trails: [], featured: null, weekly: 0, isPending: false, isError: true, refetch });
    renderHome();
    expect(screen.getByTestId('dashboard-error')).toHaveTextContent('Não foi possível carregar suas trilhas.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('empty: the hint and the way to the catalog', () => {
    useTrailDashboard.mockReturnValue({ trails: [], featured: null, weekly: 0, isPending: false, isError: false, refetch: vi.fn() });
    renderHome();
    expect(screen.getByTestId('dashboard-empty')).toHaveTextContent('Nenhuma trilha disponível ainda.');
    fireEvent.click(screen.getByRole('button', { name: 'Explorar cursos' }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
  });
});

describe('HomeRoute: a visitor', () => {
  beforeEach(visitor);

  it('shows the visitor banner and does NOT make the member-only reads', () => {
    renderHome();
    expect(screen.getByTestId('visitor-banner')).toBeInTheDocument();
    expect(screen.getByTestId('visitor-banner-cta')).toHaveAttribute('href', '/subscribe');
    expect(useTrailDashboard).toHaveBeenCalledWith({ enabled: false });
    expect(useUserStats).toHaveBeenCalledWith({ enabled: false });
    expect(useAchievements).toHaveBeenCalledWith({ enabled: false });
    expect(screen.queryByTestId('achievements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-classes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-loading')).not.toBeInTheDocument();
  });

  it('a course of the carousel leads to the catalog', () => {
    useCatalog.mockReturnValue({ data: [{ ...course, alreadyEnrolled: true }], isPending: false, isError: false, refetch: refetchCatalog });
    renderHome();
    fireEvent.click(screen.getByTestId('course-card'));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
  });

  it.each(['shell', 'pending'] as const)('on the %s surface there is no offer and no commerce wording (W-7)', (where) => {
    surface.value = where;
    const { container } = renderHome();
    expect(screen.queryByTestId('visitor-banner')).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="/subscribe"]')).toBeNull();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });
});
