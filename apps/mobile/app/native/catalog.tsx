import { useSyncExternalStore } from 'react';
import { Redirect } from 'expo-router';
import { CATALOG_MESSAGES, CatalogScreen } from '@iterahq/screens/catalog';
import { catalogHost, translate } from '../../src/screenPorts';

const t = translate(CATALOG_MESSAGES);
const host = catalogHost(t);

/** Native host of the universal catalog screen, over real data. Closed in a release build until its row is `native`. */
export default function CatalogNative() {
  const { gate, list } = useSyncExternalStore(host.subscribe, host.snapshot);
  if (gate !== 'open') return <Redirect href={gate === 'signed-out' ? '/login' : '/'} />;
  return <CatalogScreen t={t} state={list} onOpenProgram={host.open} onEnroll={host.enroll} onRetry={host.retry} />;
}
