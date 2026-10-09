import { Button } from '@devfellowship/components';
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
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => navigate('/', { replace: true })} data-testid="shell-live-unavailable-home">
        {t('shell.liveUnavailable.home')}
      </Button>
    </ShellNeutralScreen>
  );
}
