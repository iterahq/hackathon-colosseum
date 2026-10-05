import { Button } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { ShellNeutralScreen } from './ShellNeutralScreen';

/**
 * Inside the native shell, when the entitlement read FAILED and no earlier read had answered: the
 * app does not know, so it says so and offers to ask again. It never claims "no access".
 */
export function ShellAccessUnverifiedScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const { signOut } = useAuth();

  return (
    <ShellNeutralScreen testId="shell-access-unverified" title={t('shell.accessUnverified.title')}>
      <Button type="button" className="min-h-11 w-full" onClick={onRetry} data-testid="shell-access-unverified-retry">
        {t('common.retry')}
      </Button>
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => void signOut()} data-testid="shell-access-unverified-sign-out">
        {t('auth.logout')}
      </Button>
    </ShellNeutralScreen>
  );
}
