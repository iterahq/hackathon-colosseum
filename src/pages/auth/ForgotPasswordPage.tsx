import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Label } from '@devfellowship/components';
import { AuthShell } from '@/components/auth/AuthShell';
import { useI18n } from '@/i18n';
import { requestPasswordReset } from '@/services/passwordReset.service';
import { useResendCooldown } from '@/hooks/useResendCooldown';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { remaining, isActive, start } = useResendCooldown(60);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error: err } = await requestPasswordReset(email.trim());
    setBusy(false);
    if (err && err.toLowerCase().includes('rate limit')) {
      setError(t('auth.forgot.rateLimited'));
      return;
    }
    // Neutral success — never reveal whether the email has an account.
    setSent(true);
    start();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await submit();
  }

  function onResend() {
    if (isActive) return;
    void submit();
  }

  return (
    <AuthShell title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} testId="forgot-page">
      {sent ? (
        <div className="flex flex-col gap-3" data-testid="forgot-sent-state">
          <div
            className="rounded-md bg-menta/10 p-3 text-center text-sm text-foreground"
            data-testid="forgot-sent"
          >
            <p>{t('auth.forgot.sent')}</p>
            <p className="mt-1 font-medium" data-testid="forgot-sent-email">
              {email.trim()}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-center text-sm text-destructive" data-testid="forgot-error">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onResend}
            disabled={isActive}
            className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
            data-testid="forgot-resend"
          >
            {isActive ? t('auth.otp.resendIn', { seconds: remaining }) : t('auth.forgot.resend')}
          </button>
          <Link
            to="/auth/code"
            className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            data-testid="forgot-use-code"
          >
            {t('auth.forgot.useCode')}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="forgot-form">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'forgot-error' : undefined}
            data-testid="forgot-email-input"
          />
          {error && (
            <p id="forgot-error" role="alert" className="text-sm text-destructive" data-testid="forgot-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-forgot">
            {busy ? t('common.loading') : t('auth.forgot.submit')}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-2 hover:underline"
          data-testid="back-to-login"
        >
          {t('auth.forgot.back')}
        </Link>
      </p>
    </AuthShell>
  );
}
