import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { ShellNeutralScreen } from './ShellNeutralScreen';

/** What a live-class route shows inside the native shell: live class is not supported there, with a way home. */
export function ShellLiveUnavailableScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <ShellNeutralScreen testId="shell-live-unavailable" title={t('shell.liveUnavailable.title')}>
      <p className="text-sm text-muted-foreground">{t('shell.liveUnavailable.body', { host: window.location.host })}</p>
      <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#2E2A25] bg-transparent px-4 py-2 text-sm font-medium text-[#F4EDE2] transition-colors hover:bg-[#141210] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" onClick={() => navigate('/', { replace: true })} data-testid="shell-live-unavailable-home">
        {t('shell.liveUnavailable.home')}
      </button>
    </ShellNeutralScreen>
  );
}
