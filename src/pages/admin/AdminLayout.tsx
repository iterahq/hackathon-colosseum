/**
 * Tenant-admin observability shell (plan #6). Read-only window into the admin's
 * OWN tenant. Evergreen/obsidiana design, reuses the branded AppHeader.
 *
 * Sub-nav: Roster / Completion / Engagement. NO authoring affordance anywhere
 * (ADR-5 — authoring is a different app, dfl-lms-admin; structurally absent here).
 */
import { NavLink, Outlet } from 'react-router-dom';
import { Users, BarChart3, Activity, ShieldCheck, FolderGit2 } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';
import { useMembership } from '@/hooks/useMembership';
import { adminMemberships, adminTenant } from '@/services/membership.service';
import { createContext, useContext } from 'react';

const AdminTenantCtx = createContext<string | null>(null);
export function useAdminTenant(): string | null {
  return useContext(AdminTenantCtx);
}

export default function AdminLayout() {
  const { t } = useI18n();
  const { data: memberships } = useMembership();

  // The tenant this panel AGGREGATES — not the white-label brand. `branding.name`
  // (useTenantBranding) is the login-screen brand and defaults to "Itera" for
  // every tenant, so interpolating it labelled every customer's back-office
  // "Itera" (E2E 2026-07-28, finding D4). The admin's own membership row carries
  // the real tenant name.
  const admins = adminMemberships(memberships ?? []);
  const admin = adminTenant(memberships ?? []);
  const tenantId = admin?.tenantId ?? null;
  const tenantName = admin?.tenantName?.trim() || '';

  const tabs = [
    { to: '/admin/roster', label: t('admin.nav.roster'), icon: Users },
    { to: '/admin/programs', label: t('admin.nav.completion'), icon: BarChart3 },
    { to: '/admin/engagement', label: t('admin.nav.engagement'), icon: Activity },
    { to: '/admin/artifacts', label: t('admin.nav.artifacts'), icon: FolderGit2 },
  ];

  return (
    <AdminTenantCtx.Provider value={tenantId}>
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader active="discover" />
        <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
          {/* Admin hero */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-verde-floresta/60 border border-border flex items-center justify-center text-menta">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[13px] uppercase tracking-wider text-menta">
                {t('admin.kicker')}
              </span>
              <h1 className="font-display font-bold text-foreground leading-tight" data-testid="admin-title">
                {t('admin.title')}
              </h1>
            </div>
          </div>
          {/* Name the tenant being aggregated. When the name hasn't loaded (or
              the row carries none) fall back to a tenant-NEUTRAL sentence rather
              than naming the wrong organisation. */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground" data-testid="admin-subtitle">
              {tenantName
                ? t('admin.subtitle', { tenant: tenantName })
                : t('admin.subtitleGeneric')}
            </p>
            {/* An admin of several tenants sees ONE tenant's data (the surface is
                single-tenant by design — ADR-6). Say so explicitly instead of
                silently showing a slice of their world. */}
            {admins.length > 1 && (
              <p
                className="text-xs text-muted-foreground/80 mt-1"
                data-testid="admin-multi-tenant-note"
              >
                {t('admin.multiTenantNote', { n: admins.length })}
              </p>
            )}
          </div>

          {/* Sub-nav — scrolls horizontally on narrow screens so the tabs never
              force page-wide overflow (mobile: tabs slide; ≥sm: all fit). */}
          <div
            className="flex items-center gap-1.5 mb-6 border-b border-border overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0"
            data-testid="admin-subnav"
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `inline-flex flex-shrink-0 items-center gap-2 px-4 h-10 -mb-px border-b-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-menta text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </NavLink>
            ))}
          </div>

          <Outlet />
        </main>
      </div>
    </AdminTenantCtx.Provider>
  );
}
