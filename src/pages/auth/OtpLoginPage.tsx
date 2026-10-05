/**
 * Passwordless sign-in (B6): request a one-time code / magic link by email, then
 * either click the link OR type the 6-digit code here. Same access policy as the
 * password gate — `sendLoginCode` sets `shouldCreateUser: false`, so this never
 * self-serves a new account. On success navigates to the `from` location.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { Button, Input, Label } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { useI18n } from '@/i18n';
import { sendLoginCode, verifyLoginCode } from '@/services/otpAuth.service';
import { safeInternalPath } from '@/lib/safeInternalPath';
import { isGuestAccessToken } from '@/services/guestSession.service';

export default function OtpLoginPage() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = safeInternalPath((location.state as { from?: { pathname?: string } } | null)?.from?.pathname);

  // A guest session must NOT count here — same trap as AuthPage.
  if (!loading && session && !isGuestAccessToken(session.access_token)) {
    return <Navigate to={from} replace />;
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await sendLoginCode(email.trim());
    setBusy(false);
    if (err && err.toLowerCase().includes('rate limit')) {
      setError(t('auth.otp.rateLimited'));
      return;
    }
    // Neutral success — never reveal whether the email has an account.
    setSent(true);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await verifyLoginCode(email.trim(), code.trim());
    setBusy(false);
    if (err) {
      setError(t('auth.otp.error'));
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <AuthShell title={t('auth.otp.title')} subtitle={t('auth.otp.subtitle')} testId="otp-page">
      {!sent ? (
        <form onSubmit={onSend} className="flex flex-col gap-3" data-testid="otp-send-form">
          <Label htmlFor="otp-email">{t('auth.email')}</Label>
          <Input
            id="otp-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            enterKeyHint="send"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'otp-error' : undefined}
            data-testid="otp-email-input"
          />
          {error && (
            <p id="otp-error" role="alert" className="text-sm text-destructive" data-testid="otp-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-otp-send">
            {busy ? t('common.loading') : t('auth.otp.send')}
          </Button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="flex flex-col gap-3" data-testid="otp-verify-form">
          <p
            className="rounded-md bg-menta/10 p-3 text-center text-sm text-foreground"
            data-testid="otp-sent"
          >
            {t('auth.otp.sent')}
          </p>
          <label className="text-sm font-medium text-foreground" htmlFor="otp-code">
            {t('auth.otp.codeLabel')}
          </label>
          <input
            id="otp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="go"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            data-testid="otp-code-input"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="otp-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-otp-verify">
            {busy ? t('common.loading') : t('auth.otp.verify')}
          </Button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode('');
              setError(null);
            }}
            className="self-center text-xs text-muted-foreground touch-hit underline-offset-2 hover:underline"
            data-testid="otp-resend"
          >
            {t('auth.otp.resend')}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link
          to="/login"
          className="font-medium text-foreground touch-hit underline-offset-2 hover:underline"
          data-testid="otp-back-to-login"
        >
          {t('auth.otp.back')}
        </Link>
      </p>
    </AuthShell>
  );
}
