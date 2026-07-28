/**
 * AdminLayout — the tenant-admin observability shell.
 *
 * Regression cover for E2E finding D4 (2026-07-28): the subtitle interpolated
 * `branding.name` (the white-label BRAND, which defaults to "Itera" for every
 * tenant) instead of the tenant whose data the panel aggregates, so a dfl-batch
 * admin read "…alunos de Itera" over 18 dfl-batch learners.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { Membership } from '@/services/membership.service';
import AdminLayout from '@/pages/admin/AdminLayout';

const useMembership = vi.fn();
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => useMembership(),
}));

// AppHeader pulls auth/branding hooks — stub it to a thin shell.
vi.mock('@/components/branded', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

const DFL = 'dfl-batch-tenant-id';
const ITERA = 'itera-tenant-id';

function renderLayout(memberships: Membership[]) {
  useMembership.mockReturnValue({ data: memberships });
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AdminLayout />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useMembership.mockReset();
});

describe('AdminLayout tenant label (E2E D4)', () => {
  it("names the ADMIN'S OWN tenant, not the platform brand", () => {
    renderLayout([
      { tenantId: DFL, role: 'tenant_admin', tenantSlug: 'dfl-batch', tenantName: 'DFL Batch' },
    ]);
    const subtitle = screen.getByTestId('admin-subtitle');
    expect(subtitle).toHaveTextContent('DFL Batch');
    expect(subtitle).not.toHaveTextContent('Itera');
  });

  it('labels a different tenant differently (no shared hardcoded brand)', () => {
    renderLayout([
      { tenantId: ITERA, role: 'owner', tenantSlug: 'itera', tenantName: 'Itera' },
    ]);
    expect(screen.getByTestId('admin-subtitle')).toHaveTextContent('Itera');
  });

  it('falls back to a tenant-NEUTRAL subtitle when the name is unknown', () => {
    renderLayout([{ tenantId: DFL, role: 'tenant_admin' }]);
    const subtitle = screen.getByTestId('admin-subtitle');
    // Never invents/borrows a name — and specifically never says "Itera".
    expect(subtitle).not.toHaveTextContent('Itera');
    expect(subtitle).toHaveTextContent('sua organização');
  });

  it('is tenant-neutral while memberships are still loading', () => {
    useMembership.mockReturnValue({ data: undefined });
    render(
      <MemoryRouter>
        <I18nProvider>
          <AdminLayout />
        </I18nProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('admin-subtitle')).not.toHaveTextContent('Itera');
    expect(screen.queryByTestId('admin-multi-tenant-note')).toBeNull();
  });

  it('discloses when the admin spans several tenants, naming the one shown', () => {
    renderLayout([
      { tenantId: ITERA, role: 'tenant_admin', tenantSlug: 'itera', tenantName: 'Itera' },
      { tenantId: DFL, role: 'owner', tenantSlug: 'dfl-batch', tenantName: 'DFL Batch' },
    ]);
    // `owner` outranks `tenant_admin` — the deterministic pick the data layer
    // already makes — so the panel shows (and names) DFL Batch.
    expect(screen.getByTestId('admin-subtitle')).toHaveTextContent('DFL Batch');
    expect(screen.getByTestId('admin-multi-tenant-note')).toHaveTextContent('2');
  });

  it('shows no multi-tenant note for a single-tenant admin', () => {
    renderLayout([
      { tenantId: DFL, role: 'tenant_admin', tenantSlug: 'dfl-batch', tenantName: 'DFL Batch' },
    ]);
    expect(screen.queryByTestId('admin-multi-tenant-note')).toBeNull();
  });

  it('ignores a leaked personal PLG tenant when labelling', () => {
    renderLayout([
      { tenantId: 'plg-1', role: 'owner', isPersonal: true, tenantName: 'Personal' },
      { tenantId: DFL, role: 'tenant_admin', tenantSlug: 'dfl-batch', tenantName: 'DFL Batch' },
    ]);
    const subtitle = screen.getByTestId('admin-subtitle');
    expect(subtitle).toHaveTextContent('DFL Batch');
    expect(subtitle).not.toHaveTextContent('Personal');
  });
});
