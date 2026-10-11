/**
 * Itera sign-up by e-mail — free on the hackathon build.
 *
 * E-mail + password, no confirmation mail (the project has no mail provider: Supabase's built-in sender
 * reaches two addresses an hour and only the team's own), no subscription step: the account joins the
 * shared learner tenant and lands on the dashboard at once. The error line says what the server said.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Link, Navigate, useLocation } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button, Input, Label, PasswordInput } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { useI18n } from '@/i18n';
import { trackFunnel } from '@/lib/analytics';
import { returnPathOf, returnState } from '@/lib/loginReturn';
import { isGuestAccessToken } from '@/services/guestSession.service';

const MIN_PASSWORD = 8;
const INCLUDES = ['door.signUp.includes.trails', 'door.signUp.includes.stamps', 'door.signUp.includes.bounties', 'door.signUp.includes.noEmail'] as const;

/** The i18n key for a sign-up failure, by the code GoTrue returns. */
export function signUpErrorKey(code: string | null, message: string | null): { key: string; detail?: string } {
  if (code === 'user_already_exists' || /already registered/i.test(message ?? '')) return { key: 'door.signUp.error.exists' };
  if (code === 'weak_password') return { key: 'door.signUp.error.weak' };
  if (code === 'email_address_invalid' || code === 'validation_failed') return { key: 'door.signUp.error.email' };
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || /rate limit/i.test(message ?? '')) return { key: 'door.signUp.error.rate' };
  return { key: 'door.signUp.error.generic', detail: message ?? '' };
}

function Includes() {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-2" data-testid="signup-includes">
      {INCLUDES.map((key) => (
        <li key={key} className="flex items-start gap-2 text-sm text-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden />
          <span>{t(key)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SignupPage() {
  const { session, loading, signUpWithPassword } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const from = returnPathOf(location);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackFunnel('signup_started');
  }, []);

  // A guest session must NOT count here — same trap as AuthPage: it persists and
  // keeps refreshing, so a learner who once joined a live class by link would be
  // bounced off this form forever.
  if (!loading && session && !isGuestAccessToken(session.access_token)) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_PASSWORD) {
      setError(t('door.signUp.error.weak'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: message, code } = await signUpWithPassword(email.trim(), password);
    setBusy(false);
    if (message) {
      const { key, detail } = signUpErrorKey(code, message);
      setError(t(key, detail === undefined ? undefined : { detail }));
      return;
    }
    trackFunnel('signup_completed');
    navigate(from, { replace: true });
  }

  return (
    <AuthShell
      title={t('door.signUp.title')}
      subtitle={t('door.signUp.subtitle')}
      testId="signup-page"
      sidePanel={
        <div className="flex h-full flex-col gap-4">
          <h2 className="font-display text-lg font-bold text-foreground">{t('door.signUp.panelTitle')}</h2>
          <Includes />
          <p className="mt-auto text-xs text-muted-foreground" data-testid="signup-model">
            {t('door.signUp.model')}
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="signup-form">
        <Label htmlFor="signup-email">{t('auth.email')}</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'signup-error' : undefined}
          data-testid="signup-email-input"
        />
        <Label htmlFor="signup-password">{t('door.signUp.password')}</Label>
        <PasswordInput
          id="signup-password"
          autoComplete="new-password"
          enterKeyHint="go"
          required
          value={password}
          onValueChange={setPassword}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'signup-error' : undefined}
          data-testid="signup-password-input"
        />
        {error && (
          <p id="signup-error" role="alert" className="text-sm text-destructive" data-testid="signup-error">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="mt-2 min-h-11 w-full" data-testid="submit-signup">
          {busy ? t('common.loading') : t('door.signUp.submit')}
        </Button>
      </form>
      <div className="mt-4 lg:hidden">
        <Includes />
        <p className="mt-3 text-xs text-muted-foreground">{t('door.signUp.model')}</p>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t('door.signUp.walletHint')}{' '}
        <Link to="/login" state={returnState(from)} className="font-medium text-foreground touch-hit underline-offset-2 hover:underline" data-testid="signup-back-to-login">
          {t('door.signUp.walletLink')}
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" state={returnState(from)} className="font-medium text-foreground touch-hit underline-offset-2 hover:underline">
          {t('auth.toLogin')}
        </Link>
      </p>
    </AuthShell>
  );
}
