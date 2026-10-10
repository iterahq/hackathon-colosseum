/** Teacher endorsements. componente → hook → service → edge function. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { endorseCertification, getStudentCertifications } from '@/services/endorsement.service';

export function useStudentCertifications() {
  const { session, configured } = useAuth();
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.endorsements.students(session?.user?.id ?? 'anon', locale),
    queryFn: () => getStudentCertifications(locale),
    enabled: configured && Boolean(session),
    retry: false,
  });
}

export function useEndorse() {
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => endorseCertification(id, note, locale),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.endorsements.all }),
  });
}
