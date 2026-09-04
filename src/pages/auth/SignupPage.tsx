/**
 * Itera sign-up — self-serve registration (PLG front door).
 *
 * This route redirected to /login while self-serve access was closed. It is the
 * door the marketing funnel needs: a stranger arriving from a campaign has no
 * DFL membership and no subscription, so without this page every acquisition
 * channel ended at a login form for an account they could not create.
 *
 * Passwordless, mirroring OtpLoginPage: email → 6-digit code → account. The
 * only behavioural differences are `sendSignupCode` (shouldCreateUser: true)
 * and the landing route — a fresh account has no entitlement, so it goes
 * straight to /subscribe instead of `from`.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignupEmailForm } from '@/components/auth/SignupEmailForm';
import { SignupCodeForm } from '@/components/auth/SignupCodeForm';
import { useI18n } from '@/i18n';
import { sendSignupCode, verifySignupCode } from '@/services/otpAuth.service';
import { isGuestAccessToken } from '@/services/guestSession.service';

export default function SignupPage() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A guest session must NOT count here — same trap as AuthPage: it persists and
  // keeps refreshing, so a learner who once joined a live class by link would be
  // bounced off this form forever.
  if (!loading && session && !isGuestAccessToken(session.access_token)) {
    return <Navigate to="/subscribe" replace />;
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await sendSignupCode(email.trim());
    setBusy(false);
    if (err) {
      // Unlike the sign-IN flow, a failure here leaks nothing: with
      // shouldCreateUser an address that already exists gets a magic link and
      // returns success, so an error means the send genuinely failed (signups
      // disabled, SMTP down, rate limit). Swallowing it would leave the person
      // waiting for an email that was never sent.
      setError(err.toLowerCase().includes('rate limit') ? t('auth.otp.rateLimited') : t('auth.signUpError'));
      return;
    }
    // The confirmation copy stays neutral: it must read the same whether or not
    // the address already had an account, or the form becomes an enumeration
    // oracle for every address someone cares to type.
    setSent(true);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await verifySignupCode(email.trim(), code.trim());
    setBusy(false);
    if (err) {
      setError(t('auth.otp.error'));
      return;
    }
    // Always /subscribe: the account exists now, the entitlement does not.
    navigate('/subscribe', { replace: true });
  }

  return (
    <AuthShell title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')} testId="signup-page">
      {!sent ? (
        <SignupEmailForm
          email={email}
          onEmailChange={setEmail}
          onSubmit={onSend}
          busy={busy}
          error={error}
        />
      ) : (
        <SignupCodeForm
          code={code}
          onCodeChange={setCode}
          onSubmit={onVerify}
          onRestart={() => {
            setSent(false);
            setCode('');
            setError(null);
          }}
          busy={busy}
          error={error}
        />
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-2 hover:underline"
          data-testid="signup-back-to-login"
        >
          {t('auth.haveAccount')}
        </Link>
      </p>
    </AuthShell>
  );
}
