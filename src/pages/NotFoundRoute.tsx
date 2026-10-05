import { useLocation } from 'react-router-dom';
import { NotFoundScreen } from '@iterahq/screens/not-found';
import { useI18n } from '@/i18n';
import { consoleLog, HOME } from '@/lib/universalScreenHost';

/** Web host of the universal not-found screen: it only hands the screen its ports. */
export default function NotFoundRoute() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  return <NotFoundScreen path={pathname} t={t} log={consoleLog} home={HOME} />;
}
