import { useSyncExternalStore } from 'react';
import { Redirect } from 'expo-router';
import { CATALOG_MESSAGES } from '@iterahq/screens/catalog';
import { HOME_MESSAGES, HomeScreen } from '@iterahq/screens/home';
import { homeHost, translate } from '../../src/screenPorts';

const t = translate({ pt: { ...CATALOG_MESSAGES.pt, ...HOME_MESSAGES.pt } });
const host = homeHost(t);

/** Native host of the universal home screen, over real data. Closed in a release build until its row is `native`. */
export default function HomeNative() {
  const { gate, view } = useSyncExternalStore(host.subscribe, host.snapshot);
  if (gate !== 'open') return <Redirect href={gate === 'signed-out' ? '/login' : '/'} />;
  return <HomeScreen t={t} view={view} onOpenProgram={host.open} onBrowseCatalog={host.browse} onRetry={host.retry} />;
}
