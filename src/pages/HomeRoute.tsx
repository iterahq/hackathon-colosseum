import { HomeScreen } from '@iterahq/screens/home';
import { AppHeader } from '@/components/branded/AppHeader';
import { VisitorBanner } from '@/components/branded/VisitorBanner';
import { homeScreenIcon } from '@/components/branded/homeScreenIcon';
import { HomeLiveBlocks } from '@/components/live/HomeLiveBlocks';
import { useHomeScreen } from '@/hooks/useHomeScreen';

const header = <AppHeader active="discover" />;
const live = <HomeLiveBlocks />;
const aside = <VisitorBanner />;

// The header is imported by its own file, not through the `branded` barrel: the barrel pulls every branded component into the route's first load.
/** Web host of the universal home screen: it hands the screen what the hook decides and the web-only parts (header, live class, a visitor's offer). */
export default function HomeRoute() {
  return <HomeScreen {...useHomeScreen()} header={header} live={live} aside={aside} icon={homeScreenIcon} />;
}
