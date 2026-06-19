/**
 * Branded Itera app header (replaces the inherited "iterate" header).
 *
 * - Itera wordmark / tenant logo (white-label preserved from #1).
 * - Evergreen sliding nav pill (Discover / Library) — João's visual.
 * - Locale toggle (PT/EN) + sign out.
 * - Sticky, flat obsidiana background (brand: no blur/glow/gradient).
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Library, LogOut, ChevronDown, Languages, ShieldCheck } from 'lucide-react';
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initials = (user?.email ?? 'IT').slice(0, 2).toUpperCase();
  const items = [
    { id: 'discover', label: t('nav.discover'), icon: Home, to: '/' },
  ] as const;

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center gap-3 md:gap-8">
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

        <div className="flex items-center gap-1.5 md:gap-2 ml-auto">
          <button
            onClick={toggleLocale}
            className="flex items-center gap-1.5 px-3 h-9 rounded-full border border-border text-xs font-medium hover:border-verde-tech transition-colors"
            data-testid="locale-toggle"
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
                      <div className="text-[13px] text-muted-foreground truncate">
                        {branding.name}
                      </div>
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
