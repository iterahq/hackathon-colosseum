/**
 * React Query hooks for the self-serve catalog (browse + enroll).
 *
 * componente → hook → service → fetch. The enroll mutation invalidates BOTH the
 * catalog (to flip alreadyEnrolled) and the user's programs list (so the newly
 * enrolled course immediately shows up on the dashboard / becomes openable).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { enrollInProgram, getCatalogPrograms } from '@/services/catalog.service';

export function useCatalog({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.catalog.all, queryFn: getCatalogPrograms, enabled });
}

export function useEnroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => enrollInProgram(programId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalog.all });
      void qc.invalidateQueries({ queryKey: queryKeys.programs.all });
    },
  });
}
