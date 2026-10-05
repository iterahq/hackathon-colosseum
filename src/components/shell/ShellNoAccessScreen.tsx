import { Button } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { ShellNeutralScreen } from './ShellNeutralScreen';

/**
 * The one screen an account without active access meets inside the native shell (Q-11 = A): a
 * neutral sentence and a way to sign out. No price, no offer, no link into the app. Only for an
 * entitlement read that ANSWERED "no access"; a read that failed is `ShellAccessUnverifiedScreen`.
 */
export function ShellNoAccessScreen() {
  const { t } = useI18n();
  const { signOut } = useAuth();

  return (
    <ShellNeutralScreen testId="shell-no-access" title={t('shell.noAccess.title')}>
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => void signOut()} data-testid="shell-no-access-sign-out">
        {t('auth.logout')}
      </Button>
    </ShellNeutralScreen>
  );
}
