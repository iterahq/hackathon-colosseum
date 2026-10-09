import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { useMembership } from '@/hooks/useMembership';
import { useProfile } from '@/hooks/useProfile';
import { isTenantAdmin } from '@/services/membership.service';

interface Props {
  xp: number | null;
  achievements: number | null;
  activities: number | null;
}

const NAV = [
  { to: '/', key: 'dash.nav.trails' },
  { to: '/catalog', key: 'dash.nav.courses' },
  { to: '/artifacts', key: 'dash.nav.files' },
] as const;

const MENU_ITEM = 'block w-full text-left px-3 py-2 rounded-md [font:500_13px_JetBrains_Mono] text-[#F4EDE2] hover:bg-[#1C1916]';

const initialsOf = (name: string): string =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export function DashboardTopBar({ xp, achievements, activities }: Props) {
  const { t, locale, toggleLocale } = useI18n();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const { data: profile } = useProfile();
  const { data: memberships } = useMembership();
  const [open, setOpen] = useState(false);
  const dash = (n: number | null) => (n == null ? '–' : String(n));
  const label = profile?.displayName || user?.email || '';

  return (
    <header className="relative z-20 flex h-16 items-center justify-between gap-3 border-b border-[#262320] bg-[#0A0908] px-4 sm:px-8 xl:px-20">
      <div className="flex min-w-0 items-center gap-3 sm:gap-8">
        <span className="[font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2]">
          ITERA<span className="text-[#3FD17F]">/</span>
        </span>
        <nav className="flex gap-1">
          {NAV.map(({ to, key }) => {
            const active = to === pathname;
            return (
              <Link
                key={to}
                to={to}
                className={`inline-flex h-11 items-center rounded-full px-2.5 [font:500_13px_JetBrains_Mono] sm:px-3.5 ${
                  active ? 'border border-[#262320] bg-[#141210] text-[#F4EDE2]' : 'border border-transparent text-[#A0978A] hover:text-[#F4EDE2]'
                } ${active ? '' : 'max-sm:hidden'}`}
              >
                {t(key)}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="relative flex items-center gap-4">
        <span className="hidden [font:500_13px_JetBrains_Mono] text-[#A0978A] lg:inline">
          {t('dash.stats', { xp: dash(xp), achievements: dash(achievements), activities: dash(activities) })}
        </span>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-full border border-[#2E2A25] bg-[#1C1916] [font:600_12px_JetBrains_Mono] text-[#F4EDE2]"
        >
          {initialsOf(label) || '·'}
        </button>
        {open && (
          <div className="absolute right-0 top-12 w-48 rounded-lg border border-[#2E2A25] bg-[#141210] p-1.5 shadow-xl">
            {NAV.slice(1).map(({ to, key }) => (
              <Link key={to} to={to} className={`${MENU_ITEM} sm:hidden`}>
                {t(key)}
              </Link>
            ))}
            <Link to="/profile" className={MENU_ITEM}>
              {t('dash.nav.profile')}
            </Link>
            {isTenantAdmin(memberships ?? []) && (
              <Link to="/admin" className={MENU_ITEM}>
                {t('dash.nav.admin')}
              </Link>
            )}
            <button type="button" onClick={toggleLocale} className={MENU_ITEM} data-locale={locale}>
              {t('dash.nav.language')}
            </button>
            <button type="button" onClick={() => void signOut()} className={MENU_ITEM}>
              {t('dash.nav.signOut')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
