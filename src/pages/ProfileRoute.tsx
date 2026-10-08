import { ProfileScreen } from '@iterahq/screens/profile';
import { AppHeader } from '@/components/branded/AppHeader';
import { ProfileWebSlots } from '@/components/profile/ProfileWebSlots';
import { profileScreenIcon, profileScreenImage } from '@/components/profile/profileScreenParts';
import { useProfileScreen } from '@/hooks/useProfileScreen';

const header = <AppHeader active="discover" />;

/** Web host of the universal profile screen: it hands the screen what the hook decides and the web-only parts. */
export default function ProfileRoute() {
  const { screen, photoInput } = useProfileScreen();
  return <ProfileScreen {...screen} header={header} webOnly={<ProfileWebSlots photoInput={photoInput} />} icon={profileScreenIcon} image={profileScreenImage} />;
}
