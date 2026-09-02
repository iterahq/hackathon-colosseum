/**
 * Mutation hook for the /profile subscription card: schedules or undoes the
 * cancellation of the caller's subscription and refreshes the entitlement the
 * paywall reads. componente → hook → service — no fetch here.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setCancelAtPeriodEnd } from '@/services/billing.service';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/auth/AuthContext';

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (cancel: boolean) => setCancelAtPeriodEnd(cancel),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.entitlement.mine(session?.user?.id ?? 'anon'),
      }),
  });
}
