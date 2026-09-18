/**
 * Header role pill — visitor mode (2026-09-18). A signed-in user with NO
 * active subscription must read as "Visitante"/"Visitor" (role.visitor), not
 * "Aluno"/"Learner", and gets a subtle subscribe CTA next to the pill. A
 * privileged role (admin/instructor/author) is unaffected by access level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { Membership } from '@/services/membership.service';
import { AppHeader } from '@/components/branded/AppHeader';

const useMembership = vi.fn();
const useAccessLevel = vi.fn();

vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => useMembership(),
}));
vi.mock('@/hooks/useAccessLevel', () => ({
  useAccessLevel: () => useAccessLevel(),
}));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'learner@itera.dev' } }),
}));
vi.mock('@/auth/useTenantBranding', () => ({
  useTenantBranding: () => ({ branding: { name: 'Itera', logoUrl: null }, loading: false }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { displayName: 'Learner', email: 'learner@itera.dev' } }),
}));
vi.mock('@/hooks/useLiveClass', () => ({
  useEnabledTenantIds: () => ({ data: [] }),
}));

const LEARNER: Membership[] = [{ tenantId: 'plg-abc', role: 'owner', isPersonal: true }];
const ADMIN: Membership[] = [{ tenantId: 'dfl', role: 'tenant_admin', tenantSlug: 'dfl-batch' }];

function renderHeader(memberships: Membership[], level: 'pending' | 'member' | 'visitor') {
  useMembership.mockReturnValue({ data: memberships });
  useAccessLevel.mockReturnValue({ level, entitlementError: false });
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AppHeader />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useMembership.mockReset();
  useAccessLevel.mockReset();
});

describe('AppHeader role pill', () => {
  it('shows "Aluno" for a learner WITH access (member)', () => {
    renderHeader(LEARNER, 'member');
    expect(screen.getByTestId('role-pill')).toHaveTextContent('Aluno');
    expect(screen.queryByTestId('nav-subscribe-cta')).not.toBeInTheDocument();
  });

  it('shows "Visitante" for a learner with NO active subscription (visitor)', () => {
    renderHeader(LEARNER, 'visitor');
    expect(screen.getByTestId('role-pill')).toHaveTextContent('Visitante');
  });

  it('shows a subscribe CTA next to the pill for a visitor', () => {
    renderHeader(LEARNER, 'visitor');
    expect(screen.getByTestId('nav-subscribe-cta')).toBeInTheDocument();
  });

  it('a tenant_admin still reads as "Admin" even if access level were visitor', () => {
    // hasPaidAccess makes a real tenant_admin a 'member' in practice, but the
    // pill must not mislabel a privileged role even under a stale/edge state.
    renderHeader(ADMIN, 'visitor');
    expect(screen.getByTestId('role-pill')).toHaveTextContent('Admin');
    expect(screen.queryByTestId('nav-subscribe-cta')).not.toBeInTheDocument();
  });
});
