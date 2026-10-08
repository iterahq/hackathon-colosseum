import { Redirect } from 'expo-router';
import { CATALOG_MESSAGES } from '@iterahq/screens/catalog';
import { HOME_MESSAGES, HomeScreen } from '@iterahq/screens/home';
import { HOME_PREVIEW_VIEW } from '@iterahq/screens/home/fixtures';
import { translate } from '../../src/screenPorts';

const t = translate({ pt: { ...CATALOG_MESSAGES.pt, ...HOME_MESSAGES.pt } });
const noop = () => {};

/** Development preview of the universal home screen over fixture data. A release build goes home instead. */
export default function HomePreview() {
  if (!__DEV__) return <Redirect href="/" />;
  return <HomeScreen t={t} view={HOME_PREVIEW_VIEW} onOpenProgram={noop} onBrowseCatalog={noop} onRetry={noop} />;
}
