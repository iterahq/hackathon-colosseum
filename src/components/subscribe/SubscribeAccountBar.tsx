import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';

/** Who is about to pay, and the one way out if it's the wrong account. */
export function SubscribeAccountBar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  if (!user?.email) return null;

  async function handleUseAnotherAccount() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <p className="mt-3 text-xs text-muted-foreground" data-testid="subscribe-account-bar">
      {t('subscribe.signedInAs', { email: user.email })}{' '}
      <button
        type="button"
        onClick={handleUseAnotherAccount}
        className="underline-offset-2 hover:underline"
        data-testid="subscribe-use-another-account"
      >
        {t('subscribe.useAnotherAccount')}
      </button>
    </p>
  );
}
