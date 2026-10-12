import { ProfileVisibilityCard } from '@/components/privacy/ProfileVisibilityCard';
import { TalentOptIn } from '@/components/talent/TalentOptIn';
import { useWalletLink } from '@/hooks/useWalletLink';
import { AvatarPicker } from './AvatarPicker';

/** What the profile page has on the web and the shell's screen has not: the avatar picker, then who sees the learner
 * (the public profile switch and the talent board, which follows it). The subscription section stays out of the
 * hackathon build, where every account is free and there is nothing to bill. */
export function ProfileWebSlots() {
  const { wallet } = useWalletLink();
  return (
    <>
      <AvatarPicker />
      {wallet && <ProfileVisibilityCard />}
      <TalentOptIn />
    </>
  );
}
