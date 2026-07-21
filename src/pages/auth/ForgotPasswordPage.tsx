import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@devfellowship/components';
import { AuthShell } from '@/components/auth/AuthShell';
import { useI18n } from '@/i18n';
import { requestPasswordReset } from '@/services/passwordReset.service';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
  }

  return (
    <AuthShell title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} testId="forgot-page">
      {sent ? (
        <p
          className="rounded-md bg-menta/10 p-3 text-center text-sm text-foreground"
          data-testid="forgot-sent"
        >
          {t('auth.forgot.sent')}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="forgot-form">
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
            data-testid="forgot-email-input"
          />
          {error && (
            <p className="text-sm text-destructive" data-testid="forgot-error">
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
