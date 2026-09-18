import { useRef, type FormEvent } from 'react';
import { Button, InputOTP, InputOTPGroup, InputOTPSlot, Label } from '@devfellowship/components';
import { useI18n } from '@/i18n';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useResendCooldown } from '@/hooks/useResendCooldown';

const OTP_SLOT_INDEXES = [0, 1, 2, 3, 4, 5];

/** Step 2 of self-serve sign-up: type the 6-digit code that creates the account. */
export function SignupCodeForm({
  email,
  code,
  onCodeChange,
  onSubmit,
  onChangeEmail,
  onResend,
  busy,
  error,
}: {
  email: string;
  code: string;
  onCodeChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onChangeEmail: () => void;
  onResend: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const { remaining, isActive, start } = useResendCooldown(60, { startActive: true });

  function handleResend() {
    if (isActive) return;
    start();
    onResend();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="signup-verify-form">
      <div className="rounded-md bg-menta/10 p-3 text-center text-sm text-foreground" data-testid="signup-sent">
        <p data-testid="signup-sent-message">{t('auth.signUpSent')}</p>
        <p className="mt-1 font-medium" data-testid="signup-sent-email">
          {email}
        </p>
        <button
          type="button"
          onClick={onChangeEmail}
          className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="signup-change-email"
        >
          {t('auth.signup.changeEmail')}
        </button>
      </div>
      <Label htmlFor="signup-code">{t('auth.otp.codeLabel')}</Label>
      <InputOTP
        id="signup-code"
        data-testid="signup-code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        value={code}
        onChange={onCodeChange}
        onComplete={() => formRef.current?.requestSubmit()}
        autoFocus
        containerClassName="justify-center"
      >
        <InputOTPGroup>
          {OTP_SLOT_INDEXES.map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="signup-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-signup-verify">
        {busy ? t('common.loading') : t('auth.signUp')}
      </Button>
      <button
        type="button"
        onClick={handleResend}
        disabled={isActive}
        className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
        data-testid="signup-resend"
      >
        {isActive ? t('auth.otp.resendIn', { seconds: remaining }) : t('auth.otp.resend')}
      </button>
    </form>
  );
}
