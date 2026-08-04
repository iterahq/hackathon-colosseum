/**
 * Entrada visível para `/author` no menu do header.
 *
 * A superfície de autoria só era alcançável digitando a URL. O atalho é
 * EXCLUSIVO de admin do tenant — o mesmo gate que já esconde `/admin`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { Membership } from '@/services/membership.service';
import { AppHeader } from '@/components/branded/AppHeader';

const useMembership = vi.fn();
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => useMembership(),
}));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'admin@itera.dev' } }),
}));
vi.mock('@/auth/useTenantBranding', () => ({
  useTenantBranding: () => ({ branding: { name: 'Itera', logoUrl: null }, loading: false }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { displayName: 'Admin', email: 'admin@itera.dev' } }),
}));
vi.mock('@/hooks/useLiveClass', () => ({
  useEnabledTenantIds: () => ({ data: [] }),
}));

const ADMIN: Membership[] = [{ tenantId: 'dfl', role: 'tenant_admin', tenantSlug: 'dfl-batch' }];
const AUTHOR: Membership[] = [{ tenantId: 'dfl', role: 'author', tenantSlug: 'dfl-batch' }];
const LEARNER: Membership[] = [{ tenantId: 'dfl', role: 'learner', tenantSlug: 'dfl-batch' }];

async function openMenu(memberships: Membership[]) {
  useMembership.mockReturnValue({ data: memberships });
  render(
    <MemoryRouter>
      <I18nProvider>
        <AppHeader />
      </I18nProvider>
    </MemoryRouter>
  );
  await userEvent.click(screen.getByTestId('user-menu-trigger'));
}

beforeEach(() => {
  useMembership.mockReset();
});

describe('atalho de autoria no header', () => {
  it('aparece para o admin do tenant', async () => {
    await openMenu(ADMIN);
    expect(screen.getByTestId('nav-author')).toBeInTheDocument();
  });

  it('não aparece para o aluno', async () => {
    await openMenu(LEARNER);
    expect(screen.queryByTestId('nav-author')).not.toBeInTheDocument();
  });

  it('não aparece para quem só tem o papel de autor', async () => {
    await openMenu(AUTHOR);
    expect(screen.queryByTestId('nav-author')).not.toBeInTheDocument();
  });

  it('não aparece para um owner de tenant pessoal (PLG)', async () => {
    await openMenu([{ tenantId: 'plg', role: 'owner', tenantSlug: 'plg-abc', isPersonal: true }]);
    expect(screen.queryByTestId('nav-author')).not.toBeInTheDocument();
  });
});
