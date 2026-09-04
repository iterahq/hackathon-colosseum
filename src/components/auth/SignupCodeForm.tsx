/** Step 2 of self-serve sign-up: type the 6-digit code that creates the account. */
import type { FormEvent } from 'react';
import { Button } from '@devfellowship/components';
import { useI18n } from '@/i18n';

export function SignupCodeForm({
  code,
  onCodeChange,
  onSubmit,
  onRestart,
  busy,
  error,
}: {
  code: string;
  onCodeChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onRestart: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useI18n();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="signup-verify-form">
      <p
        className="rounded-md bg-menta/10 p-3 text-center text-sm text-foreground"
        data-testid="signup-sent"
      >
        {t('auth.signUpSent')}
      </p>
      <label className="text-sm font-medium text-foreground" htmlFor="signup-code">
        {t('auth.otp.codeLabel')}
      </label>
      <input
        id="signup-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={code}
        onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ''))}
        className="rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] outline-none ring-offset-background focus:ring-2 focus:ring-ring"
        data-testid="signup-code-input"
      />
      {error && (
        <p className="text-sm text-destructive" data-testid="signup-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-signup-verify">
        {busy ? t('common.loading') : t('auth.signUp')}
      </Button>
      <button
        type="button"
        onClick={onRestart}
        className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        data-testid="signup-resend"
      >
        {t('auth.otp.resend')}
      </button>
    </form>
  );
}
