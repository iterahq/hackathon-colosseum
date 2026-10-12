import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import type { CatalogProgram } from '@/types/catalog';
import LoginPage from '@/pages/auth/LoginPage';
import ProfileRoute from '@/pages/ProfileRoute';
import { AppHeader } from '@/components/branded/AppHeader';
import { LockedProgramView } from '@/components/branded/LockedProgramView';
import { VisitorBanner } from '@/components/branded/VisitorBanner';
import { GuestEndCard } from '@/components/live/GuestEndCard';

/**
 * Plan 20261003-itera-player-mobile, row W-7: every component that names a subscription or a
 * sign-up, rendered on each surface. In a browser tab the affordance is there, as before; inside
 * the shell, and while the handshake is pending, it is absent and the text carries none of the
 * wording. `scripts/shell-commerce.test.ts` proves the list of components is complete. The locked card
 * of the catalog and of the dashboard is drawn by a universal screen: its offer is built by the web hosts
 * and is covered in `src/pages/CatalogRoute.test.tsx` and `src/pages/HomeRoute.test.tsx`.
 */
const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    configured: true,
    user: { id: 'u1', email: 'learner@itera.dev' },
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
  }),
}));
vi.mock('@/auth/useTenantBranding', () => ({ useTenantBranding: () => ({ branding: { name: 'Itera', logoUrl: null }, loading: false }) }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => ({ data: [{ tenantId: 'plg-abc', role: 'owner', isPersonal: true }] }) }));
vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => ({ level: 'visitor', entitlementError: false }) }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { displayName: 'Learner', email: 'learner@itera.dev', avatarUrl: null, locale: 'pt' }, isPending: false, isError: false }),
}));
vi.mock('@/hooks/useLiveClass', () => ({ useEnabledTenantIds: () => ({ data: [] }) }));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({
    data: { active: true, status: 'active', currentPeriodEnd: '2027-01-01T00:00:00Z', cancelAtPeriodEnd: false, seatCount: 1 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/services/profile.service', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ displayName: 'Ana', avatarUrl: null, dflAvatarUrl: null, email: 'ana@example.com', locale: 'pt' }),
  updateMyProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

const FORBIDDEN = /assin|plano|preço|R\$|cri(ar|e) (sua |minha )?conta|cadastr|subscri|trial|sign ?up|pagamento/i;

const program: CatalogProgram = {
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
};

const SURFACES: [name: string, element: ReactElement, affordance: string][] = [
  ['the header of an account without access', <AppHeader />, 'nav-subscribe-cta'],
  ['a locked program', <LockedProgramView program={program} />, 'program-locked-subscribe'],
  ['the visitor banner', <VisitorBanner />, 'visitor-banner-cta'],
  ['the guest end card', <GuestEndCard />, 'guest-end-signup'],
];

function mount(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <I18nProvider>{element}</I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const commerceLinks = (root: HTMLElement) => [...root.querySelectorAll('a')].filter((a) => /^\/(subscribe|signup)/.test(a.getAttribute('href') ?? ''));

describe('commerce affordances per surface', () => {
  beforeEach(() => {
    surface.value = 'web';
  });

  it.each(SURFACES)('in a browser tab %s keeps its affordance', (_name, element, affordance) => {
    const { container } = mount(element);
    expect(screen.getByTestId(affordance)).toBeInTheDocument();
    expect(commerceLinks(container)).toHaveLength(1);
  });

  it.each(SURFACES)('inside the shell %s has no affordance and no wording', (_name, element, affordance) => {
    surface.value = 'shell';
    const { container } = mount(element);
    expect(screen.queryByTestId(affordance)).not.toBeInTheDocument();
    expect(commerceLinks(container)).toHaveLength(0);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it.each(SURFACES)('while the handshake is pending %s shows none of it either', (_name, element, affordance) => {
    surface.value = 'pending';
    const { container } = mount(element);
    expect(screen.queryByTestId(affordance)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it.each(['web', 'shell', 'pending'] as const)('the login page is wallet-only on the %s surface: no sign-up or subscribe link', (value) => {
    surface.value = value;
    const { container } = mount(<LoginPage />);
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
    expect(commerceLinks(container)).toHaveLength(0);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('the guest end card keeps its way to the login inside the shell', () => {
    surface.value = 'shell';
    mount(<GuestEndCard />);
    expect(screen.getByTestId('guest-end-login')).toHaveAttribute('href', '/login');
  });

  describe('the profile of an ENTITLED account', () => {
    it('in a browser tab shows the subscription section with billing', async () => {
      mount(<ProfileRoute />);
      await screen.findByTestId('profile-name-input');
      expect(screen.getByTestId('subscription-section')).toBeInTheDocument();
      expect(screen.getByTestId('subscription-manage-billing')).toBeInTheDocument();
    });

    it('inside the shell shows the profile without the subscription section', async () => {
      surface.value = 'shell';
      const { container } = mount(<ProfileRoute />);
      await screen.findByTestId('profile-name-input');
      expect(screen.queryByTestId('subscription-section')).not.toBeInTheDocument();
      expect(screen.queryByTestId('subscription-manage-billing')).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(FORBIDDEN);
    });
  });
});
