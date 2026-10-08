import { AVATAR_MIME_TYPES } from '@/utils/avatarFile';
import { WebOnly } from '@/components/shell/WebOnly';
import type { ProfilePhotoInput } from '@/hooks/useProfileScreen';
import { SubscriptionSection } from './SubscriptionSection';

/**
 * What the profile page has on the web and the shell's screen has not: the file picker behind
 * "Enviar foto", and the subscription section, which stays out of the shell surface (W-7).
 */
export function ProfileWebSlots({ photoInput }: { photoInput: ProfilePhotoInput }) {
  return (
    <>
      <input ref={photoInput.ref} type="file" accept={AVATAR_MIME_TYPES.join(',')} className="hidden" data-testid="profile-photo-file" onChange={photoInput.onChange} />
      <WebOnly>
        <SubscriptionSection />
      </WebOnly>
    </>
  );
}
