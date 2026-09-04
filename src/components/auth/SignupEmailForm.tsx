/** Step 1 of self-serve sign-up: ask for the email that will receive the code. */
import type { FormEvent } from 'react';
import { Button } from '@devfellowship/components';
import { useI18n } from '@/i18n';

export function SignupEmailForm({
  email,
  onEmailChange,
  onSubmit,
  busy,
  error,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useI18n();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="signup-send-form">
      <label className="text-sm font-medium text-foreground" htmlFor="signup-email">
        {t('auth.email')}
      </label>
      <input
        id="signup-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
        data-testid="signup-email-input"
      />
      {error && (
        <p className="text-sm text-destructive" data-testid="signup-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-signup-send">
        {busy ? t('common.loading') : t('auth.otp.send')}
      </Button>
    </form>
  );
}
