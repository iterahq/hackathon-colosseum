import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Loader2, X } from 'lucide-react';
import { Button, Label, PasswordInput } from '@devfellowship/components';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { updatePassword } from '@/services/passwordReset.service';
import { validateNewPassword } from '@/utils/validateNewPassword';

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${ok ? 'text-evergreen' : 'text-muted-foreground'}`}>
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </li>
  );
}

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
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => navigate('/', { replace: true }), 1500);
    return () => clearTimeout(id);
  }, [done, navigate]);

  const hasLength = password.length >= 8;
  const matches = confirm.length > 0 && password === confirm;

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
    setDone(true);
  }

  return (
    <AuthShell title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} testId="reset-page">
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : done ? (
        <div className="flex flex-col gap-2 text-center" data-testid="reset-success">
          <p className="rounded-md bg-menta/10 p-3 text-sm text-foreground">{t('auth.reset.successTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('auth.reset.successBody')}</p>
        </div>
      ) : !session ? (
        <div className="flex flex-col gap-4 text-center" data-testid="reset-invalid">
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {t('auth.reset.invalid')}
          </p>
          <p className="text-xs text-muted-foreground">{t('auth.reset.invalidHint')}</p>
          <Button asChild className="w-full">
            <Link to="/auth/forgot" data-testid="request-new-link">
              {t('auth.reset.requestNew')}
            </Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="reset-form">
          <Label htmlFor="new-password">{t('auth.reset.newPassword')}</Label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onValueChange={setPassword}
            aria-describedby="reset-checklist"
            data-testid="new-password-input"
          />
          <Label htmlFor="confirm-password">{t('auth.reset.confirmPassword')}</Label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            required
            value={confirm}
            onValueChange={setConfirm}
            aria-describedby="reset-checklist"
            data-testid="confirm-password-input"
          />
          <ul id="reset-checklist" className="flex flex-col gap-1" data-testid="reset-checklist">
            <ChecklistItem ok={hasLength} label={t('auth.reset.checklist.length')} />
            <ChecklistItem ok={matches} label={t('auth.reset.checklist.match')} />
          </ul>
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="reset-error">
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
