import { CatalogScreen } from '@iterahq/screens/catalog';
import { AppHeader } from '@/components/branded/AppHeader';
import { catalogScreenIcon } from '@/components/branded/catalogScreenIcon';
import { useCatalogScreen } from '@/hooks/useCatalogScreen';

const header = <AppHeader active="catalog" />;

// The header is imported by its own file, not through the `branded` barrel: the barrel pulls every branded component into the route's first load.
/** Web host of the universal catalog screen: it hands the screen what the hook decides and the web-only chrome. */
export default function CatalogRoute() {
  return <CatalogScreen {...useCatalogScreen()} header={header} icon={catalogScreenIcon} />;
}
