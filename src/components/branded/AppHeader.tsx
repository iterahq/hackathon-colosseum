/**
 * Branded Itera app header — parity with João Pedro's design navbar.
 *
 * LEFT:   Itera wordmark / tenant logo + sliding evergreen nav pill (Discover).
 * CENTER: Search field (Search courses, topics, badges…) → /?q=… (HomePage
 *         filters its program grid; real feature, not decoration).
 * RIGHT:  role pill (Learner / Admin — reflects real membership) · notifications
 *         bell · settings gear (opens the same menu that hosts the PT/EN locale
 *         toggle — the locale feature is PRESERVED, just relocated) · avatar +
 *         chevron menu (Discover / Admin / Sign out).
 * Sticky, flat obsidiana background (brand: no blur/glow/gradient).
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Library,
  LogOut,
  ChevronDown,
  Languages,
  ShieldCheck,
  Search,
  Bell,
  Settings,
} from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { useTenantBranding } from '@/auth/useTenantBranding';
import { useMembership } from '@/hooks/useMembership';
import { isTenantAdmin } from '@/services/membership.service';

export function AppHeader({ active = 'discover' }: { active?: 'discover' | 'library' | 'admin' }) {
  const { signOut, user } = useAuth();
  const { t, toggleLocale, locale } = useI18n();
  const { branding } = useTenantBranding();
  const { data: memberships } = useMembership();
  const showAdmin = isTenantAdmin(memberships ?? []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Keep the input in sync if the URL ?q= changes elsewhere.
  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  const submitSearch = (value: string) => {
    const q = value.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
  };

  const initials = (user?.email ?? 'IT').slice(0, 2).toUpperCase();
  const items = [{ id: 'discover', label: t('nav.discover'), icon: Home, to: '/' }] as const;

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center gap-3 md:gap-6">
        {/* LEFT — logo + nav pill */}
        <Link to="/" className="flex-shrink-0" data-testid="header-logo">
          <Logo size={28} logoUrl={branding.logoUrl} alt={branding.name} />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {items.map((it) => {
            const isActive = active === it.id;
            return (
              <Link
                key={it.id}
                to={it.to}
                className={`relative px-4 h-9 rounded-full text-sm font-medium flex items-center gap-2 transition-colors ${
                  isActive ? 'text-obsidiana' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-menta rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <it.icon className="w-4 h-4 relative" />
                <span className="relative">{it.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* CENTER — search (parity with design; filters HomePage via ?q=) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(query);
          }}
          className="hidden md:flex flex-1 max-w-xl mx-auto"
          role="search"
        >
          <label className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('nav.search')}
              data-testid="nav-search"
              aria-label={t('nav.search')}
              className="w-full h-9 pl-10 pr-4 rounded-full bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-verde-tech/60 transition-colors"
            />
          </label>
        </form>

        {/* RIGHT — role pill · bell · settings · avatar */}
        <div className="flex items-center gap-1.5 md:gap-2.5 ml-auto md:ml-0">
          {/* Role pill — reflects real membership (Learner / Admin) */}
          <span
            data-testid="role-pill"
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-full border text-xs font-medium ${
              showAdmin
                ? 'border-evergreen/40 bg-evergreen-soft text-evergreen-hi'
                : 'border-border bg-card text-muted-foreground'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${showAdmin ? 'bg-evergreen' : 'bg-menta'}`} />
            {showAdmin ? t('role.admin') : t('role.learner')}
          </span>

          {/* Notifications bell */}
          <button
            type="button"
            aria-label={t('nav.notifications')}
            data-testid="nav-bell"
            className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-verde-tech/50 transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* Settings gear → opens the menu (locale toggle lives there) */}
          <button
            type="button"
            aria-label={t('nav.settings')}
            data-testid="nav-settings"
            onClick={() => setOpen((v) => !v)}
            className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-verde-tech/50 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Mobile-only compact locale toggle (the gear/menu carries it on ≥sm) */}
          <button
            onClick={toggleLocale}
            className="sm:hidden flex items-center gap-1.5 px-3 h-9 rounded-full border border-border text-xs font-medium hover:border-verde-tech transition-colors"
            data-testid="locale-toggle-mobile"
            aria-label="Toggle language"
          >
            <Languages className="w-3.5 h-3.5" />
            {locale === 'pt' ? 'PT' : 'EN'}
          </button>

          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              className={`flex items-center gap-1 md:gap-1.5 p-0.5 md:pr-2 rounded-full border transition-colors ${
                open ? 'border-verde-tech bg-card' : 'border-transparent hover:border-border'
              }`}
              data-testid="user-menu-trigger"
            >
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-evergreen-soft border border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center text-xs md:text-sm">
                {initials}
              </div>
              <ChevronDown
                className={`hidden md:block w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-border bg-card overflow-hidden"
                >
                  <div className="p-4 border-b border-border flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-evergreen-soft border border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-semibold truncate">
                        {user?.email?.split('@')[0] ?? 'Learner'}
                      </div>
                      <div className="text-[13px] text-muted-foreground truncate">{branding.name}</div>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate('/');
                      }}
                      className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors hover:bg-obsidiana/60"
                    >
                      <Library className="w-4 h-4" /> {t('nav.discover')}
                    </button>
                    {showAdmin && (
                      <button
                        onClick={() => {
                          setOpen(false);
                          navigate('/admin');
                        }}
                        className={`w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors hover:bg-obsidiana/60 ${
                          active === 'admin' ? 'text-menta' : ''
                        }`}
                        data-testid="nav-admin"
                      >
                        <ShieldCheck className="w-4 h-4" /> {t('admin.nav.roster')}
                      </button>
                    )}
                    {/* Locale toggle — preserved here (the standalone PT/EN pill
                        was replaced by the parity gear). */}
                    <button
                      onClick={toggleLocale}
                      className="w-full flex items-center justify-between gap-3 px-3 h-10 rounded-xl text-sm transition-colors hover:bg-obsidiana/60"
                      data-testid="locale-toggle"
                    >
                      <span className="flex items-center gap-3">
                        <Languages className="w-4 h-4" /> {t('nav.language')}
                      </span>
                      <span className="font-mono text-xs text-evergreen-hi">
                        {locale === 'pt' ? 'PT' : 'EN'}
                      </span>
                    </button>
                  </div>
                  <div className="p-1.5 border-t border-border">
                    <button
                      onClick={async () => {
                        setOpen(false);
                        await signOut();
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      data-testid="sign-out"
                    >
                      <LogOut className="w-4 h-4" /> {t('auth.logout')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
