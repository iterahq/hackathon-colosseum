import { AvatarPicker } from './AvatarPicker';

/** What the profile page has on the web and the shell's screen has not: the avatar picker. The subscription
 * section stays out of the hackathon build, where every account is free and there is nothing to bill. */
export function ProfileWebSlots() {
  return <AvatarPicker />;
}
