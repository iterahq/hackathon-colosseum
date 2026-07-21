/**
 * Form state for the /profile page: hydrates the draft from the loaded profile
 * once, tracks name/avatar edits, and persists via useUpdateProfile. The avatar
 * can be set three ways — a bundled preset icon, an uploaded photo (Supabase
 * storage, via useUploadAvatar), or the fellow's DFL ("Learn") photo. A revert
 * restores the last SAVED avatar so a mis-click is undoable. Component stays
 * render-only.
 */
import { useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useUploadAvatar } from '@/hooks/useUploadAvatar';

export function useProfileForm() {
  const query = useProfile();
  const update = useUpdateProfile();
  const upload = useUploadAvatar();
  const { data: profile, isPending } = query;

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  // The last SAVED avatar — the target of "revert". Seeded at hydration and
  // advanced on every successful save.
  const [savedAvatarUrl, setSavedAvatarUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || isPending) return;
    setName(profile?.displayName ?? '');
    setAvatarUrl(profile?.avatarUrl ?? '');
    setSavedAvatarUrl(profile?.avatarUrl ?? '');
    setHydrated(true);
  }, [hydrated, isPending, profile]);

  const dflAvatarUrl = profile?.dflAvatarUrl ?? null;
  const canSave = name.trim().length >= 2 && !update.isPending && !upload.isPending;
  const canRevert = hydrated && avatarUrl !== savedAvatarUrl;

  const editName = (value: string) => {
    setName(value);
    setSaved(false);
  };

  const pickPreset = (url: string) => {
    setAvatarUrl(url);
    setSaved(false);
  };

  const useLearnPhoto = () => {
    if (!dflAvatarUrl) return;
    setAvatarUrl(dflAvatarUrl);
    setSaved(false);
  };

  const uploadPhoto = (file: File) => {
    upload.mutate(file, {
      onSuccess: (url) => {
        setAvatarUrl(url);
        setSaved(false);
      },
    });
  };

  const revert = () => {
    setAvatarUrl(savedAvatarUrl);
    setSaved(false);
  };

  const save = () => {
    if (!canSave) return;
    update.mutate(
      { displayName: name.trim(), avatarUrl },
      {
        onSuccess: () => {
          setSavedAvatarUrl(avatarUrl);
          setSaved(true);
        },
      }
    );
  };

  return {
    query,
    profile,
    name,
    avatarUrl,
    dflAvatarUrl,
    canSave,
    canRevert,
    saved,
    saving: update.isPending,
    saveError: update.isError,
    uploading: upload.isPending,
    uploadError: upload.isError,
    editName,
    pickPreset,
    useLearnPhoto,
    uploadPhoto,
    revert,
    save,
  };
}
