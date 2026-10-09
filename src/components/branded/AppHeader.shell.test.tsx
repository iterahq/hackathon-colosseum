import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import { AppHeader } from '@/components/branded/AppHeader';

const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({
    data: [{ tenantId: 'dfl', role: 'tenant_admin', tenantSlug: 'dfl-batch' }],
  }),
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
  useEnabledTenantIds: () => ({ data: ['dfl'] }),
}));
vi.mock('@/hooks/useAccessLevel', () => ({
  useAccessLevel: () => ({ level: 'member', entitlementError: false }),
}));

async function openMenu() {
  render(
    <MemoryRouter>
      <I18nProvider>
        <AppHeader />
      </I18nProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByTestId('user-menu-trigger'));
}

const STAFF_ENTRIES = ['nav-admin', 'nav-author', 'nav-start-live-class'];

describe('staff entries in the account menu', () => {
  beforeEach(() => {
    surface.value = 'web';
  });

  it('show in a browser tab', async () => {
    await openMenu();
    for (const id of STAFF_ENTRIES) expect(screen.getByTestId(id)).toBeInTheDocument();
  });

  it.each(['shell', 'pending'] as const)('are absent while the surface is %s', async (value) => {
    surface.value = value;
    await openMenu();
    expect(screen.getByTestId('nav-catalog')).toBeInTheDocument();
    for (const id of STAFF_ENTRIES) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  });
});
