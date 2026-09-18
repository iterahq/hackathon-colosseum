import type { FormEvent } from 'react';
import { Button, Input, Label } from '@devfellowship/components';
import { useI18n } from '@/i18n';

/** Step 1 of self-serve sign-up: ask for the email that will receive the code. */
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
      <Label htmlFor="signup-email">{t('auth.email')}</Label>
      <Input
        id="signup-email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'signup-email-error' : undefined}
        data-testid="signup-email-input"
      />
      {error && (
        <p id="signup-email-error" role="alert" className="text-sm text-destructive" data-testid="signup-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-signup-send">
        {busy ? t('common.loading') : t('auth.otp.send')}
      </Button>
    </form>
  );
}
