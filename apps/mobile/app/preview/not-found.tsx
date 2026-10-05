import { Redirect, usePathname } from 'expo-router';
import { NOT_FOUND_MESSAGES, NotFoundScreen } from '@iterahq/screens/not-found';
import { HOME, shellLog, translate } from '../../src/screenPorts';

const t = translate(NOT_FOUND_MESSAGES);

/** Development preview of the universal not-found screen. A release build has no such route: it goes home. */
export default function NotFoundPreview() {
  const path = usePathname();
  if (!__DEV__) return <Redirect href="/" />;
  return <NotFoundScreen path={path} t={t} log={shellLog} home={HOME} />;
}
