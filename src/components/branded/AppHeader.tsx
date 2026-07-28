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
  GraduationCap,
  LogOut,
  ChevronDown,
  Languages,
  ShieldCheck,
  Search,
  Bell,
  Settings,
  Video,
  UserRound, FolderGit2 } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { useTenantBranding } from '@/auth/useTenantBranding';
import { useMembership } from '@/hooks/useMembership';
import { useProfile } from '@/hooks/useProfile';
import { isTenantAdmin, highestRole, instructorTenantId } from '@/services/membership.service';
import { useEnabledTenantIds } from '@/hooks/useLiveClass';

export function AppHeader({
  active = 'discover',
}: {
  active?: 'discover' | 'catalog' | 'library' | 'admin' | 'artifacts';
}) {
  const { signOut, user } = useAuth();
  const { t, toggleLocale, setLocale, locale } = useI18n();
  const { branding } = useTenantBranding();
  const { data: memberships } = useMembership();
  const { data: enabledTenantIds } = useEnabledTenantIds();
  const { data: profile } = useProfile();
  const showAdmin = isTenantAdmin(memberships ?? []);
  const canStartLiveClass =
    instructorTenantId(memberships ?? [], { enabledTenantIds: enabledTenantIds ?? [] }) !== null;
  // Role pill reflects the user's HIGHEST-privilege role (loop-2 fix #5) — an
  // instructor must read as "Instrutor", not "Aluno". `showAdmin` still gates the
  // /admin nav on tenant_admin/owner only (an instructor doesn't see /admin).
  const role = highestRole(memberships ?? []);
  const roleIsPrivileged = role !== 'learner';
  const roleKey =
    role === 'owner' || role === 'tenant_admin'
      ? 'role.admin'
      : role === 'instructor'
        ? 'role.instructor'
        : role === 'author'
          ? 'role.author'
          : 'role.learner';
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

  // Identity shown in the header — mirrored from DFL on federated login
  // (display_name + avatar_url from itera.users, pulled from DFL public.profiles).
  const displayName = profile?.displayName ?? user?.email?.split('@')[0] ?? 'Learner';
  const avatarUrl = profile?.avatarUrl ?? null;
  const initials = (profile?.displayName ?? user?.email ?? 'IT').slice(0, 2).toUpperCase();
  const items = [
    { id: 'discover', label: t('nav.discover'), icon: Home, to: '/' },
    { id: 'catalog', label: t('nav.catalog'), icon: GraduationCap, to: '/catalog' },
    // "Meu repositório" — reachable without having just finished an activity.
    // Tainan: "isso também tem que ser acessível pela navbar."
    { id: 'artifacts', label: t('nav.artifacts'), icon: FolderGit2, to: '/artifacts' },
  ] as const;

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="w-full px-4 h-14 md:h-16 flex items-center gap-3 md:gap-6">
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
          {/* Role pill — reflects the highest-privilege membership role. */}
          <span
            data-testid="role-pill"
            data-role={role}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-full border text-xs font-medium ${
              roleIsPrivileged
                ? 'border-evergreen/40 bg-evergreen-soft text-evergreen-hi'
                : 'border-border bg-card text-muted-foreground'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${roleIsPrivileged ? 'bg-evergreen' : 'bg-menta'}`} />
            {t(roleKey)}
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
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 md:w-9 md:h-9 rounded-full object-cover border border-evergreen/40"
                  data-testid="header-avatar"
                />
              ) : (
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-evergreen-soft border border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center text-xs md:text-sm">
                  {initials}
                </div>
              )}
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
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate('/profile');
                    }}
                    data-testid="menu-profile-shortcut"
                    aria-label={t('nav.profile')}
                    className="w-full p-4 border-b border-border flex items-center gap-3 text-left hover:bg-obsidiana/60 transition-colors"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-full object-cover border border-evergreen/40"
                        data-testid="menu-avatar"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-evergreen-soft border border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-display font-semibold truncate" data-testid="menu-display-name">
                        {displayName}
                      </div>
                      <div className="text-[13px] text-muted-foreground truncate">
                        {profile?.email ?? user?.email ?? branding.name}
                      </div>
                      <div className="text-[11px] text-menta">{t('profile.viewProfile')}</div>
                    </div>
                  </button>
                  <div className="p-1.5">
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate('/profile');
                      }}
                      data-testid="nav-profile"
                      className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors hover:bg-obsidiana/60"
                    >
                      <UserRound className="w-4 h-4" /> {t('nav.profile')}
                    </button>
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate('/');
                      }}
                      className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors hover:bg-obsidiana/60"
                    >
                      <Library className="w-4 h-4" /> {t('nav.discover')}
                    </button>
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate('/catalog');
                      }}
                      data-testid="nav-catalog"
                      className={`w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors hover:bg-obsidiana/60 ${
                        active === 'catalog' ? 'text-menta' : ''
                      }`}
                    >
                      <GraduationCap className="w-4 h-4" /> {t('nav.catalog')}
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
                    {/* Instructor/admin shortcut to start a live class — only visible
                        when the user holds a staff role in a live_class_enabled tenant. */}
                    {canStartLiveClass && (
                      <button
                        onClick={() => {
                          setOpen(false);
                          navigate('/live/instructor');
                        }}
                        data-testid="nav-start-live-class"
                        className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors hover:bg-obsidiana/60 text-evergreen-hi"
                      >
                        <Video className="w-4 h-4" /> {t('live.instructor.start.cta')}
                      </button>
                    )}
                    {/* Language preference — saved to the user PROFILE
                        (itera.users.locale, DB-backed via useLocaleSync). A
                        two-option selector (Português / Inglês), not just a
                        toggle. `locale-toggle` testid kept for back-compat e2e. */}
                    <div className="px-3 pt-2 pb-1">
                      <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Languages className="w-4 h-4" /> {t('profile.language')}
                      </span>
                    </div>
                    <div className="px-2 pb-1.5 grid grid-cols-2 gap-1.5" data-testid="locale-selector">
                      <button
                        type="button"
                        onClick={() => setLocale('pt')}
                        aria-pressed={locale === 'pt'}
                        data-testid="locale-option-pt"
                        className={`flex items-center justify-center gap-2 h-9 rounded-xl text-sm transition-colors border ${
                          locale === 'pt'
                            ? 'border-evergreen/50 bg-evergreen-soft text-evergreen-hi'
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-obsidiana/60'
                        }`}
                      >
                        <span className="font-mono text-xs">PT</span> {t('lang.pt')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocale('en')}
                        aria-pressed={locale === 'en'}
                        data-testid="locale-option-en"
                        className={`flex items-center justify-center gap-2 h-9 rounded-xl text-sm transition-colors border ${
                          locale === 'en'
                            ? 'border-evergreen/50 bg-evergreen-soft text-evergreen-hi'
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-obsidiana/60'
                        }`}
                      >
                        <span className="font-mono text-xs">EN</span> {t('lang.en')}
                      </button>
                    </div>
                    {/* Back-compat single-toggle (hidden) — older e2e selectors. */}
                    <button
                      type="button"
                      onClick={toggleLocale}
                      data-testid="locale-toggle"
                      className="sr-only"
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      {locale === 'pt' ? 'PT' : 'EN'}
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
