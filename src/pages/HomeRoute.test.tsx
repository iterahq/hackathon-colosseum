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
const useVideoCourses = vi.fn();
const useActiveLiveClass = vi.fn();
const useNextScheduledClass = vi.fn();
const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));

vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => useAccessLevel() }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/hooks/useTrailDashboard', () => ({ useTrailDashboard: (...a: unknown[]) => useTrailDashboard(...a) }));
vi.mock('@/hooks/useContent', () => ({ useUserStats: (...a: unknown[]) => useUserStats(...a) }));
vi.mock('@/hooks/useAchievements', () => ({ useAchievements: (...a: unknown[]) => useAchievements(...a) }));
vi.mock('@/hooks/useCatalog', () => ({ useCatalog: (...a: unknown[]) => useCatalog(...a) }));
vi.mock('@/hooks/useVideoCourses', () => ({ useVideoCourses: () => useVideoCourses() }));
vi.mock('@/hooks/useLiveClass', () => ({
  useActiveLiveClass: () => useActiveLiveClass(),
  useNextScheduledClass: () => useNextScheduledClass(),
  useEnabledTenantIds: () => ({ data: [] }),
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

const lesson = (id: string, position: number, durationSeconds: number) => ({ id, courseId: 'v1', title: id, description: '', videoUrl: '', durationSeconds, position });
const videoCourse = {
  id: 'v1',
  slug: 'git-github',
  title: 'Git e GitHub para Iniciantes',
  description: '',
  thumbnailUrl: null,
  teacherName: 'Tainan Fidelis',
  teacherAvatarUrl: null,
  position: 1,
  lessons: [lesson('a', 1, 420), lesson('b', 2, 480)],
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
  useVideoCourses.mockReturnValue({ courses: [] });
  useActiveLiveClass.mockReturnValue({ data: null });
  useNextScheduledClass.mockReturnValue({ data: null });
});

describe('HomeRoute: a member', () => {
  beforeEach(member);

  it('draws the top bar with the counts and makes the member reads', () => {
    renderHome();
    expect(screen.getAllByLabelText('sequência de 1 dias').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('120 XP · nível 1 · 120 de 200 para o próximo').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('0 conquistas').length).toBeGreaterThan(0);
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

  it('the other trail is a visible, muted locked card until the previous one is done', () => {
    renderHome();
    const cards = screen.getAllByTestId('trail-card');
    expect(cards.map((c) => c.getAttribute('data-status'))).toEqual(['in_progress', 'locked']);
    const locked = cards[1];
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).toHaveTextContent('CSS');
    expect(locked).toHaveTextContent('depois de HTML');
    expect(within(locked).getByTestId('trail-card-action')).toBeDisabled();
    expect(screen.getByTestId('trail-cards')).toHaveTextContent('2 trilhas · 0 concluídas');
  });

  it('every trail is always on screen: no disclosure, no hidden or collapsible group', () => {
    renderHome();
    const section = screen.getByTestId('trail-cards');
    expect(section.querySelector('details')).toBeNull();
    expect(section).not.toHaveTextContent('Bloqueadas');
    expect(screen.queryByTestId('trail-cards-locked')).not.toBeInTheDocument();
    expect(within(section).getAllByTestId('trail-days')).toHaveLength(2);
  });

  it('the active trail card continues the trail', () => {
    renderHome();
    const card = screen.getAllByTestId('trail-card')[0];
    expect(card).toHaveTextContent('Continuar trilha');
    expect(card).toHaveTextContent('Certificação');
    fireEvent.click(within(card).getByTestId('trail-card-action'));
    expect(navigate).toHaveBeenLastCalledWith('/program/itera-v2#trail-u-html');
  });

  it('a finished trail is a review card with a golden certification, and the next one opens', () => {
    useTrailDashboard.mockReturnValue(dashboard([done('a1'), done('a2'), done('a3')]));
    renderHome();
    const hero = screen.getByTestId('featured-trail');
    expect(hero).toHaveTextContent('CSS');
    const card = screen.getAllByTestId('trail-card').find((c) => c.getAttribute('data-status') === 'done')!;
    expect(card).toHaveTextContent('Rever trilha');
    expect(card).toHaveTextContent('Certificação dourada');
    fireEvent.click(within(card).getByTestId('trail-card-action'));
    expect(navigate).toHaveBeenLastCalledWith('/program/itera-v2#trail-u-html');
  });

  it('the weekly goal counts the last 7 days against 20', () => {
    useTrailDashboard.mockReturnValue(dashboard([done('a1')], { weekly: 9 }));
    renderHome();
    expect(screen.getByTestId('weekly-goal')).toHaveTextContent('9 de 20 atividades');
  });

  it('the certifications panel is compact: title, n of total, the link and one thumbnail per trail', () => {
    renderHome();
    const panel = screen.getByTestId('achievements');
    expect(panel).toHaveTextContent('Certificações do Tera');
    expect(panel).toHaveTextContent('0 de 2');
    expect(within(panel).getByRole('link', { name: 'Ver certificações →' })).toHaveAttribute('href', '/passport');
    expect(within(panel).getAllByTestId('passport-card')).toHaveLength(2);
  });

  it('certifications: one page per trail, an on-chain mark on minted rows only, medals on the shelf', () => {
    const trailRow = (key: string, refId: string, over = {}) =>
      achievement({ key, kind: 'trail', earned: { id: `r-${key}`, achievementKey: key, refId, earnedAt: '2026-10-08T00:00:00Z', mintStatus: 'minted', assetAddress: 'Asset111', txSignature: 'tx', ...over } });
    useAchievements.mockReturnValue({
      items: [
        trailRow('trail_pass', 'u-html'),
        achievement({ key: 'first_stamp', kind: 'milestone', title: { pt: 'Primeiro carimbo' }, earned: { id: 'm1', achievementKey: 'first_stamp', refId: null, earnedAt: null, mintStatus: 'pending', assetAddress: null, txSignature: null } }),
        achievement({ key: 'streak_7', kind: 'streak', title: { pt: 'Sequência 7' }, sort: 2 }),
      ],
      earnedCount: 2,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useTrailDashboard.mockReturnValue(dashboard([done('a1'), done('a2')]));
    renderHome();
    const panel = screen.getByTestId('achievements');
    expect(within(panel).getAllByTestId('passport-card')).toHaveLength(2);
    expect(within(panel).getAllByTestId('passport-medal').map((m) => m.getAttribute('data-earned'))).toEqual(['true', 'false']);
    const marks = within(panel).getAllByTestId('onchain-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute('href', 'https://explorer.solana.com/tx/tx?cluster=devnet');
  });

  it('live classes: hidden when empty, then the class in progress with the way in', () => {
    const { unmount } = renderHome();
    expect(screen.queryByTestId('live-classes')).not.toBeInTheDocument();
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

  it('the course carousel lists the video courses, each opening its course, with a link to the whole library', () => {
    useVideoCourses.mockReturnValue({ courses: [videoCourse] });
    renderHome();
    const card = screen.getByTestId('course-card');
    expect(card).toHaveTextContent('Git e GitHub para Iniciantes');
    expect(card).toHaveTextContent('2 vídeos · 15min');
    expect(card).toHaveAttribute('href', '/course/git-github');
    expect(screen.getByTestId('course-carousel-all')).toHaveAttribute('href', '/catalog');
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
    expect(screen.getByTestId('dashboard-empty').querySelector('[data-tera]')).not.toBeNull();
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

  it('a course of the carousel leads to its video course', () => {
    useVideoCourses.mockReturnValue({ courses: [videoCourse] });
    renderHome();
    expect(screen.getByTestId('course-card')).toHaveAttribute('href', '/course/git-github');
  });

  it.each(['shell', 'pending'] as const)('on the %s surface there is no offer and no commerce wording (W-7)', (where) => {
    surface.value = where;
    const { container } = renderHome();
    expect(screen.queryByTestId('visitor-banner')).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="/subscribe"]')).toBeNull();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });
});
