/**
 * Mutation hook for the /profile photo upload: pushes a File to the `avatars`
 * storage bucket via profile.service and resolves to its public URL. The caller
 * (useProfileForm) sets that URL as the draft avatar; it is persisted only when
 * the user saves. componente → hook → service — no Supabase here.
 */
import { useMutation } from '@tanstack/react-query';
import { uploadAvatar } from '@/services/profile.service';

export function useUploadAvatar() {
  return useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
  });
}
