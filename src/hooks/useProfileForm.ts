/**
 * Form state for the /profile page: hydrates the draft from the loaded profile
 * once, tracks name/avatar/photo edits, validates the photo URL (https-only)
 * and persists via useUpdateProfile. Component stays render-only.
 */
import { useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { PROFILE_AVATAR_PRESETS } from '@/consts/profileAvatars';
import { isSafePhotoUrl } from '@/utils/safePhotoUrl';

export function useProfileForm() {
  const query = useProfile();
  const update = useUpdateProfile();
  const { data: profile, isPending } = query;

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || isPending) return;
    setName(profile?.displayName ?? '');
    setAvatarUrl(profile?.avatarUrl ?? '');
    if (profile?.avatarUrl && !PROFILE_AVATAR_PRESETS.includes(profile.avatarUrl)) {
      setPhotoUrl(profile.avatarUrl);
    }
    setHydrated(true);
  }, [hydrated, isPending, profile]);

  const photoInvalid = photoUrl.trim().length > 0 && !isSafePhotoUrl(photoUrl);
  const canSave = name.trim().length >= 2 && !update.isPending && !photoInvalid;

  const editName = (value: string) => {
    setName(value);
    setSaved(false);
  };

  const pickPreset = (url: string) => {
    setAvatarUrl(url);
    setPhotoUrl('');
    setSaved(false);
  };

  const editPhotoUrl = (value: string) => {
    setPhotoUrl(value);
    if (isSafePhotoUrl(value)) setAvatarUrl(value.trim());
    setSaved(false);
  };

  const save = () => {
    if (!canSave) return;
    update.mutate(
      { displayName: name.trim(), avatarUrl },
      { onSuccess: () => setSaved(true) }
    );
  };

  return {
    query,
    profile,
    name,
    avatarUrl,
    photoUrl,
    photoInvalid,
    canSave,
    saved,
    saving: update.isPending,
    saveError: update.isError,
    editName,
    pickPreset,
    editPhotoUrl,
    save,
  };
}
