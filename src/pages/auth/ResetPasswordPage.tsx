import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@devfellowship/components';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { updatePassword } from '@/services/passwordReset.service';
import { validateNewPassword } from '@/utils/validateNewPassword';

const inputCls =
  'rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring';

export default function ResetPasswordPage() {
  // The recovery link signs the user in via detectSessionInUrl; without that
  // session the page can only offer a fresh reset request.
  const { session, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const issue = validateNewPassword(password, confirm);
    if (issue) {
      setError(t(issue === 'weak' ? 'auth.reset.weak' : 'auth.reset.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(t('auth.reset.error'));
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <AuthShell title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} testId="reset-page">
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !session ? (
        <div className="flex flex-col gap-4 text-center" data-testid="reset-invalid">
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {t('auth.reset.invalid')}
          </p>
          <Link
            to="/auth/forgot"
            className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
            data-testid="request-new-link"
          >
            {t('auth.reset.requestNew')}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="reset-form">
          <label className="text-sm font-medium text-foreground" htmlFor="new-password">
            {t('auth.reset.newPassword')}
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            data-testid="new-password-input"
          />
          <label className="text-sm font-medium text-foreground" htmlFor="confirm-password">
            {t('auth.reset.confirmPassword')}
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls}
            data-testid="confirm-password-input"
          />
          {error && (
            <p className="text-sm text-destructive" data-testid="reset-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="submit-reset">
            {busy ? t('common.loading') : t('auth.reset.submit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
