import { useSyncExternalStore } from 'react';
import { Redirect } from 'expo-router';
import { CATALOG_MESSAGES } from '@iterahq/screens/catalog';
import { PROFILE_MESSAGES, ProfileScreen } from '@iterahq/screens/profile';
import { LEGAL_HELP, profileHost, translate } from '../../src/screenPorts';

const t = translate({ pt: { ...CATALOG_MESSAGES.pt, ...PROFILE_MESSAGES.pt } });
const host = profileHost();

/** Native host of the universal profile screen, over real data. Closed in a release build until its row is `native`. */
export default function ProfileNative() {
  const { gate, form, learnPhoto } = useSyncExternalStore(host.subscribe, host.snapshot);
  if (gate !== 'open') return <Redirect href={gate === 'signed-out' ? '/login' : '/'} />;
  const onLearn = learnPhoto ? host.takeLearnPhoto : undefined;
  return <ProfileScreen t={t} state={form} {...host.actions} onUseLearnPhoto={onLearn} legalHelp={LEGAL_HELP} />;
}
