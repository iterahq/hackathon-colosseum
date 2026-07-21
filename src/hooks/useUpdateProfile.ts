/**
 * Mutation hook for the /profile page: persists displayName + avatarUrl via
 * profile.service (RLS users_update_self) and refreshes every profile-derived
 * surface (header avatar, live roster) by invalidating the profile root key.
 * componente → hook → service — no Supabase here.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMyProfile } from '@/services/profile.service';
import { queryKeys } from '@/lib/queryKeys';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { displayName?: string; avatarUrl?: string }) => {
      const ok = await updateMyProfile(patch);
      if (!ok) throw new Error('profile-update-failed');
      return true;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile.all }),
  });
}
