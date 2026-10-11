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
      <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#3FD17F] px-4 py-2 text-sm font-semibold text-[#0A0908] transition-colors hover:bg-[#5BE095] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F4EDE2]" onClick={onRetry} data-testid="shell-access-unverified-retry">
        {t('common.retry')}
      </button>
      <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#2E2A25] bg-transparent px-4 py-2 text-sm font-medium text-[#F4EDE2] transition-colors hover:bg-[#141210] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" onClick={() => void signOut()} data-testid="shell-access-unverified-sign-out">
        {t('auth.logout')}
      </button>
    </ShellNeutralScreen>
  );
}
