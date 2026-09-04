/**
 * Itera auth — sign-in surface.
 *
 * Self-serve sign-up lives at /signup (passwordless); access still requires a
 * DFL membership or an active subscription — creating an account only gets you
 * to the paywall. DFL is the primary federated IdP.
 * Google login has been removed. Per-tenant white-label branding via ?tenant=.
 * On success navigates to the `from` location (default '/').
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { Button } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { loginWithDfl } from '@/auth/dflFederation';
import { AuthShell } from '@/components/auth/AuthShell';
import { useI18n } from '@/i18n';
import { safeInternalPath } from '@/lib/safeInternalPath';
import { isGuestAccessToken } from '@/services/guestSession.service';

export default function AuthPage() {
  const { session, loading, signInWithPassword, configured } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // location.state is client-controlled and `from` reaches the DFL federate URL
  // as the post-login redirect — only a same-origin in-app path may pass through.
  const from = safeInternalPath((location.state as { from?: { pathname?: string } } | null)?.from?.pathname);

  // Already signed in → straight to the app; without this the persisted session
  // LOOKS lost and the user "logs in again". A GUEST session must NOT count: it
  // persists in localStorage and keeps refreshing, so a learner who once joined
  // by link was bounced off this form forever, and `RequireAuth` then sent them
  // to the stored (ended) guest class — every route landed on the podium.
  if (!loading && session && !isGuestAccessToken(session.access_token)) {
    return <Navigate to={from} replace />;
  }

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

  return (
    <AuthShell title={t('auth.welcome')} subtitle={t('auth.subtitle')} testId="login-page">
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
        <Link
          to="/auth/forgot"
          className="self-end text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="forgot-password-link"
        >
          {t('auth.forgot.link')}
        </Link>
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

      {/* Federated IdP — DFL is the primary CTA. Google login removed. */}
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
        <Link
          to="/auth/code"
          className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="goto-otp"
        >
          {t('auth.otp.link')}
        </Link>
      </div>

      {/* Sign-up CTA — the self-serve door. Access still requires a subscription
          or DFL membership; /signup only mints the account that can pay. */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t('auth.noAccount')}{' '}
        <Link
          to="/signup"
          className="font-medium text-foreground underline-offset-2 hover:underline"
          data-testid="goto-signup"
        >
          {t('auth.signUp')}
        </Link>
      </p>
    </AuthShell>
  );
}
