/**
 * Itera auth — shared sign-in / sign-up surface.
 *
 * `mode='signin'` → password sign-IN (the foundation gate, "Bem-vindo de volta").
 * `mode='signup'` → password sign-UP (self-serve registration, "Crie sua conta").
 *
 * Both modes share one layout + the federated IdP buttons (DFL OIDC / Google,
 * minimal). Per-tenant white-label branding via ?tenant=. On success either mode
 * navigates to the `from` location (default '/') — so signup → /subscribe works
 * for a new self-serve visitor exactly like login does.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { loginWithDfl } from '@/auth/dflFederation';
import { useTenantBranding } from '@/auth/useTenantBranding';
import { useI18n } from '@/i18n';
import { Logo } from '@/components/branded';

export type AuthMode = 'signin' | 'signup';

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { signInWithPassword, signUpWithPassword, signInWithOAuth, configured } = useAuth();
  const { branding } = useTenantBranding();
  const { t, toggleLocale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
  // Preserve the `from` intent across the login ↔ signup cross-link.
  const crossLinkState = location.state ?? undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = isSignup
      ? await signUpWithPassword(email.trim(), password)
      : await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(t(isSignup ? 'auth.signUpError' : 'auth.error'));
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden"
      style={branding.loginBg ? { backgroundImage: `url(${branding.loginBg})`, backgroundSize: 'cover' } : undefined}
      data-testid={isSignup ? 'signup-page' : 'login-page'}
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
          <h1 className="font-display text-xl font-bold text-foreground">
            {t(isSignup ? 'auth.signUpTitle' : 'auth.welcome')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(isSignup ? 'auth.signUpSubtitle' : 'auth.subtitle')}
          </p>
        </div>

        {!configured && (
          <p className="mb-4 rounded-md bg-destructive/10 p-2 text-center text-xs text-destructive">
            Supabase is not configured (VITE_SUPABASE_* missing).
          </p>
        )}

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3"
          data-testid={isSignup ? 'signup-form' : 'login-form'}
        >
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
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            data-testid="password-input"
          />
          {error && (
            <p className="text-sm text-destructive" data-testid={isSignup ? 'signup-error' : 'login-error'}>
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy}
            className="mt-2 w-full"
            data-testid={isSignup ? 'submit-signup' : 'submit-login'}
          >
            {busy ? t('common.loading') : t(isSignup ? 'auth.signUp' : 'auth.signIn')}
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
            {t(isSignup ? 'auth.signUpWith' : 'auth.signInWith', { provider: 'DFL' })}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signInWithOAuth('google')}
            data-testid="oauth-google"
          >
            {t(isSignup ? 'auth.signUpWith' : 'auth.signInWith', { provider: 'Google' })}
          </Button>
        </div>

        {/* Cross-link: login ↔ signup, preserving the `from` intent. */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t(isSignup ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
          {isSignup ? (
            <Link
              to="/login"
              state={crossLinkState}
              className="font-medium text-foreground underline-offset-2 hover:underline"
              data-testid="goto-login"
            >
              {t('auth.toLogin')}
            </Link>
          ) : (
            <Link
              to="/signup"
              state={crossLinkState}
              className="font-medium text-foreground underline-offset-2 hover:underline"
              data-testid="goto-signup"
            >
              {t('auth.toSignup')}
            </Link>
          )}
        </p>

        <button
          type="button"
          onClick={toggleLocale}
          className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="locale-toggle"
        >
          {t('locale.switch')}
        </button>
      </div>
    </div>
  );
}
