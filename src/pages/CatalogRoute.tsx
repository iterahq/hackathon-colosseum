import { CatalogScreen } from '@iterahq/screens/catalog';
import { AppHeader } from '@/components/branded';
import { catalogScreenIcon } from '@/components/branded/catalogScreenIcon';
import { useCatalogScreen } from '@/hooks/useCatalogScreen';

const header = <AppHeader active="catalog" />;

/** Web host of the universal catalog screen: it hands the screen what the hook decides and the web-only chrome. */
export default function CatalogRoute() {
  return <CatalogScreen {...useCatalogScreen()} header={header} icon={catalogScreenIcon} />;
}
