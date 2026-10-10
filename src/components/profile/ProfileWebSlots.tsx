import { WebOnly } from '@/components/shell/WebOnly';
import { AvatarPicker } from './AvatarPicker';
import { SubscriptionSection } from './SubscriptionSection';

/** What the profile page has on the web and the shell's screen has not: the avatar picker, and the subscription section (W-7). */
export function ProfileWebSlots() {
  return (
    <>
      <AvatarPicker />
      <WebOnly>
        <SubscriptionSection />
      </WebOnly>
    </>
  );
}
