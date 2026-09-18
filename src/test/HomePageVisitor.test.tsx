/**
 * HomePage — visitor mode (2026-09-18). A signed-in user with no active
 * subscription (RequireSubscription mode="preview" lets them reach "/")
 * sees the visitor banner + the catalog LOCKED instead of the (always empty)
 * enrolled-programs dashboard, and the queries that would just come back
 * empty/erroring for them (enrolled programs, stats, badges) are never fired.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import HomePage from '@/pages/HomePage';

const useAccessLevel = vi.fn();
const usePrograms = vi.fn();
const useUserStats = vi.fn();
const useBadges = vi.fn();
const useCatalog = vi.fn();

vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => useAccessLevel() }));
vi.mock('@/hooks', () => ({
  usePrograms: (...args: unknown[]) => usePrograms(...args),
  useUserStats: (...args: unknown[]) => useUserStats(...args),
  useBadges: (...args: unknown[]) => useBadges(...args),
}));
vi.mock('@/hooks/useCatalog', () => ({ useCatalog: (...args: unknown[]) => useCatalog(...args) }));
vi.mock('@/hooks/useLiveClass', () => ({
  useActiveLiveClass: () => ({ data: null }),
  useNextScheduledClass: () => ({ data: null }),
  useEnabledTenantIds: () => ({ data: [] }),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({ useIteraIdentity: () => ({ userId: 'u1' }) }));
// StatsCard (member path) reads useAuth for the display name fallback.
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'learner@itera.dev' }, session: null, configured: true }),
}));
vi.mock('@/components/live/NextScheduledClassBlock', () => ({
  NextScheduledClassBlock: () => null,
}));
vi.mock('@/components/branded', async (orig) => {
  const actual = await orig<typeof import('@/components/branded')>();
  return {
    ...actual,
    AppHeader: () => <div data-testid="app-header" />,
  };
});

function renderHome(children: ReactNode = <HomePage />) {
  return render(
    <MemoryRouter>
      <I18nProvider>{children}</I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAccessLevel.mockReset();
  usePrograms.mockReset();
  useUserStats.mockReset();
  useBadges.mockReset();
  useCatalog.mockReset();
  usePrograms.mockReturnValue({ data: [], isPending: false, isError: false, refetch: vi.fn() });
  useUserStats.mockReturnValue({ data: undefined, isPending: false });
  useBadges.mockReturnValue({ data: undefined, isPending: false });
  useCatalog.mockReturnValue({ data: [], isPending: false, isError: false, refetch: vi.fn() });
});

describe('HomePage — visitor mode', () => {
  it('shows the visitor banner and does NOT fire the member-only queries', () => {
    useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
    renderHome();

    expect(screen.getByTestId('visitor-banner')).toBeInTheDocument();
    expect(screen.getByTestId('visitor-banner-cta')).toHaveAttribute('href', '/subscribe');
    expect(usePrograms).toHaveBeenCalledWith({ enabled: false });
    expect(useUserStats).toHaveBeenCalledWith({ enabled: false });
    expect(useBadges).toHaveBeenCalledWith({ enabled: false });
    expect(useCatalog).toHaveBeenCalledWith({ enabled: true });
  });

  it('renders the catalog LOCKED (no enrolled-programs empty state) for a visitor', () => {
    useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
    useCatalog.mockReturnValue({
      data: [
        {
          id: 'p1',
          tenantId: 't',
          tenantSlug: 'itera',
          slug: 'modele-dados-com-ia',
          title: { pt: 'Modele seus dados com IA' },
          createdAt: '',
          unitCount: 1,
          lessonCount: 2,
          activityCount: 8,
          alreadyEnrolled: false,
        },
      ],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderHome();

    expect(screen.getByTestId('programs-grid-locked')).toBeInTheDocument();
    expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-locked-cta')).toHaveAttribute('href', '/subscribe');
    expect(screen.queryByTestId('programs-empty')).not.toBeInTheDocument();
  });

  it('a member (non-visitor) still sees the normal enrolled-programs flow', () => {
    useAccessLevel.mockReturnValue({ level: 'member', entitlementError: false });
    renderHome();

    expect(screen.queryByTestId('visitor-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('programs-empty')).toBeInTheDocument();
    expect(usePrograms).toHaveBeenCalledWith({ enabled: true });
    expect(useCatalog).toHaveBeenCalledWith({ enabled: false });
  });
});
