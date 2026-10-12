import { ProfileScreen } from '@iterahq/screens/profile';
import { AppTopBar } from '@/components/header/AppTopBar';
import '@/components/dashboard/dashboard.css';
import { ProfileWebSlots } from '@/components/profile/ProfileWebSlots';
import { profileScreenIcon, profileScreenImage } from '@/components/profile/profileScreenParts';
import { WalletBalance } from '@/components/wallet/WalletBalance';
import { APP_GRID_STYLE } from '@/consts/headerShell';
import { useProfileScreen } from '@/hooks/useProfileScreen';

/** The wallet comes first on the profile, as in a wallet app: what the learner holds, and the way to spend it. */
const header = (
  <>
    <AppTopBar />
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 empty:hidden md:pt-8">
      <WalletBalance />
    </div>
  </>
);

/**
 * Web host of the universal profile screen: the shared top bar and grid around it, the screen's own body inside.
 * The cast of the exercises (a relative's and a friend's name, age and job) stays out of the hackathon build: a
 * stranger is not asked for a family member's data to try a demo. The exercises use their example names instead.
 */
export default function ProfileRoute() {
  const { screen } = useProfileScreen();
  return (
    <div className="dash-root overflow-x-clip text-[#F4EDE2] max-sm:pb-[76px] [&>div]:!bg-transparent" style={APP_GRID_STYLE}>
      <ProfileScreen {...screen} personalization={undefined} header={header} webOnly={<ProfileWebSlots />} icon={profileScreenIcon} image={profileScreenImage} />
    </div>
  );
}
