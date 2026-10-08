/**
 * The web host of the universal home screen. The data hooks are mocked and the REAL screen renders, so what
 * is asserted is what a learner sees and what each control does. The cases of the old page's test
 * (`HomePageVisitor.test.tsx`) and of its cards (`EnrolledProgramCard.test.tsx`) live here; the screen's own
 * states are in `packages/screens/src/home/HomeScreen.test.tsx`.
 *
 * Visitor mode (2026-09-18): a signed-in user with no active subscription (RequireSubscription
 * mode="preview" lets them reach "/") sees the visitor banner and the catalog LOCKED instead of the (always
 * empty) dashboard, and the reads that would come back empty or in error for them are never made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import HomeRoute from '@/pages/HomeRoute';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const useAccessLevel = vi.fn();
const usePrograms = vi.fn();
const useUserStats = vi.fn();
const useBadges = vi.fn();
const useCatalog = vi.fn();
const useActiveLiveClass = vi.fn();
const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));

vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => useAccessLevel() }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/hooks', () => ({
  usePrograms: (...args: unknown[]) => usePrograms(...args),
  useUserStats: (...args: unknown[]) => useUserStats(...args),
  useBadges: (...args: unknown[]) => useBadges(...args),
}));
vi.mock('@/hooks/useCatalog', () => ({ useCatalog: (...args: unknown[]) => useCatalog(...args) }));
vi.mock('@/hooks/useLiveClass', () => ({
  useActiveLiveClass: () => useActiveLiveClass(),
  useNextScheduledClass: () => ({ data: null }),
  useEnabledTenantIds: () => ({ data: [] }),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({ useIteraIdentity: () => ({ userId: 'u1' }) }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'learner@itera.dev' }, session: null, configured: true }),
}));
// AppHeader pulls auth/membership/branding hooks; the header slot only needs to be there.
vi.mock('@/components/branded/AppHeader', () => ({ AppHeader: () => <div data-testid="app-header" /> }));

const FORBIDDEN = /assin|plano|preço|R\$|cri(ar|e) (sua |minha )?conta|cadastr|subscri|trial|sign ?up|pagamento/i;

const program = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  tenantId: 't',
  slug: 'modele-dados-com-ia',
  title: { pt: 'Modele seus dados com IA' },
  createdAt: '2026-01-01T00:00:00Z',
  unitCount: 1,
  lessonCount: 2,
  activityCount: 8,
  completedCount: 0,
  icon: 'code',
  ...over,
});
const course = { ...program(), tenantSlug: 'itera', alreadyEnrolled: false };

const refetchPrograms = vi.fn();
const refetchCatalog = vi.fn();
const member = () => useAccessLevel.mockReturnValue({ level: 'member', entitlementError: false });
const visitor = () => useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
const programs = (...data: ReturnType<typeof program>[]) => usePrograms.mockReturnValue({ data, isPending: false, isError: false, refetch: refetchPrograms });

function renderHome(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <HomeRoute />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  surface.value = 'web';
  usePrograms.mockReturnValue({ data: [], isPending: false, isError: false, refetch: refetchPrograms });
  useUserStats.mockReturnValue({ data: undefined, isPending: false });
  useBadges.mockReturnValue({ data: undefined, isPending: false });
  useCatalog.mockReturnValue({ data: [], isPending: false, isError: false, refetch: refetchCatalog });
  useActiveLiveClass.mockReturnValue({ data: null });
});

describe('HomeRoute: a member', () => {
  beforeEach(member);

  it('draws the header slot, the hero and the welcome panel with the counts', () => {
    useUserStats.mockReturnValue({ data: { totalXp: 120, streakDays: 0, badgeCount: 2, completedActivities: 7 }, isPending: false });
    renderHome();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Aprenda construindo projetos reais');
    expect(within(h1).getByText('projetos reais')).toHaveClass('text-gradient');
    const panel = screen.getByTestId('stats-card');
    expect(panel).toHaveTextContent('Bem-vindo de volta, learner');
    expect(panel).toHaveTextContent('LE');
    expect(panel).toHaveTextContent('120XP total');
    expect(panel).toHaveTextContent('7Atividades');
    expect(screen.queryByTestId('visitor-banner')).not.toBeInTheDocument();
  });

  it('makes the member reads and not the catalog read', () => {
    renderHome();
    expect(usePrograms).toHaveBeenCalledWith({ enabled: true });
    expect(useUserStats).toHaveBeenCalledWith({ enabled: true });
    expect(useBadges).toHaveBeenCalledWith({ enabled: true });
    expect(useCatalog).toHaveBeenCalledWith({ enabled: false });
  });

  it('the counts are a dash while they load', () => {
    useUserStats.mockReturnValue({ data: undefined, isPending: true });
    renderHome();
    expect(screen.getByTestId('stats-card')).toHaveTextContent('–XP total');
  });

  it('a program not started: Start, and both the button and the band open it', () => {
    programs(program());
    renderHome();
    const card = screen.getByTestId('program-card');
    expect(within(card).getByTestId('program-open')).toHaveTextContent('Começar');
    expect(card).not.toHaveTextContent('concluído');
    fireEvent.click(screen.getByTestId('program-open'));
    expect(navigate).toHaveBeenLastCalledWith('/program/modele-dados-com-ia');
    navigate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Modele seus dados com IA' }));
    expect(navigate).toHaveBeenLastCalledWith('/program/modele-dados-com-ia');
  });

  it('a program in progress: the percent and Continue', () => {
    programs(program({ completedCount: 2 }));
    renderHome();
    const card = screen.getByTestId('program-card');
    expect(card).toHaveTextContent('25% concluído');
    expect(within(card).getByTestId('program-open')).toHaveTextContent('Continuar');
  });

  it('orders the grid: in progress first, finished last', () => {
    programs(program({ id: 'a', slug: 'done', title: { pt: 'Done' }, completedCount: 8 }), program({ id: 'b', slug: 'fresh', title: { pt: 'Fresh' } }), program({ id: 'c', slug: 'going', title: { pt: 'Going' }, completedCount: 1 }));
    renderHome();
    expect(within(screen.getByTestId('programs-grid')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Going', 'Fresh', 'Done']);
  });

  it('the search of the header (?q=) filters the grid by title', () => {
    programs(program(), program({ id: 'p2', slug: 'css', title: { pt: 'CSS na prática' } }));
    renderHome('/?q=css');
    expect(within(screen.getByTestId('programs-grid')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['CSS na prática']);
  });

  it('loading: three shimmering blocks', () => {
    usePrograms.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: refetchPrograms });
    const { container } = renderHome();
    expect(container.querySelectorAll('.ds-shimmer')).toHaveLength(3);
  });

  it('error: the message, and Retry reads the programs again', () => {
    usePrograms.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: refetchPrograms });
    renderHome();
    expect(screen.getByTestId('programs-error')).toHaveTextContent('Não foi possível carregar os programas.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchPrograms).toHaveBeenCalledTimes(1);
    expect(refetchCatalog).not.toHaveBeenCalled();
  });

  it('empty: the hint and the way to the catalog', () => {
    renderHome();
    expect(screen.getByTestId('programs-empty')).toHaveTextContent('Nenhum programa disponível ainda.');
    fireEvent.click(screen.getByTestId('programs-empty-browse'));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
  });

  it('the medals: a note when there is none, the grid with the names otherwise', () => {
    const { unmount } = renderHome();
    expect(screen.getByTestId('badges-empty')).toHaveTextContent('Conclua atividades para ganhar conquistas.');
    unmount();
    useBadges.mockReturnValue({ data: [{ id: 'b1', slug: 'first', title: { pt: 'Primeira lição' }, icon: null, earned: true }, { id: 'b2', slug: 'x', title: { pt: 'Maratonista' }, icon: null, earned: false }], isPending: false });
    renderHome();
    expect(screen.getByTestId('badge-grid')).toHaveTextContent('Primeira liçãoMaratonista');
  });

  it('the live slot: a class in progress shows its block with the way in', () => {
    useActiveLiveClass.mockReturnValue({ data: { id: 'live-1', instructorId: 'someone-else' } });
    renderHome();
    fireEvent.click(within(screen.getByTestId('live-class-block')).getByTestId('live-class-join'));
    expect(navigate).toHaveBeenLastCalledWith('/live/live-1');
  });
});

describe('HomeRoute: a visitor', () => {
  beforeEach(visitor);

  it('shows the visitor banner and does NOT make the member-only reads', () => {
    renderHome();
    expect(screen.getByTestId('visitor-banner')).toBeInTheDocument();
    expect(screen.getByTestId('visitor-banner-cta')).toHaveAttribute('href', '/subscribe');
    expect(screen.queryByTestId('stats-card')).not.toBeInTheDocument();
    expect(usePrograms).toHaveBeenCalledWith({ enabled: false });
    expect(useUserStats).toHaveBeenCalledWith({ enabled: false });
    expect(useBadges).toHaveBeenCalledWith({ enabled: false });
    expect(useCatalog).toHaveBeenCalledWith({ enabled: true });
  });

  it('renders the catalog LOCKED (no enrolled-programs empty state, no medals, no live block)', () => {
    useCatalog.mockReturnValue({ data: [course], isPending: false, isError: false, refetch: refetchCatalog });
    useActiveLiveClass.mockReturnValue({ data: { id: 'live-1', instructorId: 'someone-else' } });
    renderHome();
    expect(screen.getByTestId('programs-grid-locked')).toBeInTheDocument();
    expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-locked-cta')).toHaveAttribute('href', '/subscribe');
    expect(screen.getByText('Assine para desbloquear os programas e atividades.')).toBeInTheDocument();
    expect(screen.queryByTestId('programs-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badges-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-class-block')).not.toBeInTheDocument();
  });

  it('error: the catalog message, and Retry reads the catalog again', () => {
    useCatalog.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: refetchCatalog });
    renderHome();
    expect(screen.getByTestId('programs-error')).toHaveTextContent('Não foi possível carregar o catálogo.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('empty: the catalog note, with no button to the catalog', () => {
    renderHome();
    expect(screen.getByTestId('programs-empty')).toHaveTextContent('Nenhum curso no catálogo ainda.');
    expect(screen.queryByTestId('programs-empty-browse')).not.toBeInTheDocument();
  });

  it.each(['shell', 'pending'] as const)('on the %s surface there is no offer, no hint and no commerce wording (W-7)', (where) => {
    surface.value = where;
    useCatalog.mockReturnValue({ data: [course], isPending: false, isError: false, refetch: refetchCatalog });
    const { container } = renderHome();
    expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
    expect(screen.queryByTestId('visitor-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-locked-cta')).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="/subscribe"]')).toBeNull();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });
});
