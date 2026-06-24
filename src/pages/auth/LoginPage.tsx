/**
 * Itera login — password auth (the foundation gate) + federated IdP buttons
 * (DFL OIDC / social, minimal). Per-tenant white-label branding via ?tenant=.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { loginWithDfl } from '@/auth/dflFederation';
import { useTenantBranding } from '@/auth/useTenantBranding';
import { useI18n } from '@/i18n';
import { Logo } from '@/components/branded';

export default function LoginPage() {
  const { signInWithPassword, signInWithOAuth, configured } = useAuth();
  const { branding } = useTenantBranding();
  const { t, toggleLocale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(t('auth.error'));
      return;
    }
    navigate(from, { replace: true });
  }

  const accent = branding.primaryColor ?? undefined;

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden"
      style={branding.loginBg ? { backgroundImage: `url(${branding.loginBg})`, backgroundSize: 'cover' } : undefined}
      data-testid="login-page"
    >
      {!branding.loginBg && (
        /* Flat brand backdrop: subtle grid only (no gradient/blur/glow orb). */
        <div className="absolute inset-0 grid-pattern opacity-30" />
      )}
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.name} className="h-10" data-testid="tenant-logo" />
          ) : (
            <div data-testid="brand-name">
              <Logo size={36} />
            </div>
          )}
          <h1 className="font-display text-xl font-bold text-foreground">{t('auth.welcome')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.subtitle')}</p>
        </div>

        {!configured && (
          <p className="mb-4 rounded-md bg-destructive/10 p-2 text-center text-xs text-destructive">
            Supabase is not configured (VITE_SUPABASE_* missing).
          </p>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="login-form">
          <label className="text-sm font-medium text-foreground" htmlFor="email">
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            data-testid="email-input"
          />
          <label className="text-sm font-medium text-foreground" htmlFor="password">
            {t('auth.password')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            data-testid="password-input"
          />
          {error && (
            <p className="text-sm text-destructive" data-testid="login-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-login">
            {busy ? t('common.loading') : t('auth.signIn')}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Federated IdP — DFL is ONE option among several (ADR-103). Minimal/stubbed. */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => loginWithDfl(from)}
            data-testid="oauth-dfl"
          >
            {t('auth.signInWith', { provider: 'DFL' })}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signInWithOAuth('google')}
            data-testid="oauth-google"
          >
            {t('auth.signInWith', { provider: 'Google' })}
          </Button>
        </div>

        <button
          type="button"
          onClick={toggleLocale}
          className="mt-6 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="locale-toggle"
        >
          {t('locale.switch')}
        </button>
      </div>
    </div>
  );
}
