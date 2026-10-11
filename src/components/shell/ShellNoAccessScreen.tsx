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
      <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#2E2A25] bg-transparent px-4 py-2 text-sm font-medium text-[#F4EDE2] transition-colors hover:bg-[#141210] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" onClick={() => void signOut()} data-testid="shell-no-access-sign-out">
        {t('auth.logout')}
      </button>
    </ShellNeutralScreen>
  );
}
