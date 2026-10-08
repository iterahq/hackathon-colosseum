import { Redirect } from 'expo-router';
import { CATALOG_MESSAGES, CatalogScreen } from '@iterahq/screens/catalog';
import { CATALOG_PREVIEW_STATE } from '@iterahq/screens/catalog/fixtures';
import { translate } from '../../src/screenPorts';

const t = translate(CATALOG_MESSAGES);
const noop = () => {};

/** Development preview of the universal catalog screen over fixture data. A release build goes home instead. */
export default function CatalogPreview() {
  if (!__DEV__) return <Redirect href="/" />;
  return <CatalogScreen t={t} state={CATALOG_PREVIEW_STATE} onOpenProgram={noop} onEnroll={noop} onRetry={noop} />;
}
