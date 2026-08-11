/**
 * Liga a porta de personalização ao Supabase. Fica FORA da árvore de
 * atividades: o renderer só conhece `personalizationPort`.
 *
 * O elenco é carregado uma vez por sessão e fica no cache — a substituição
 * precisa acontecer ANTES de a atividade pintar, senão o aluno vê `{{...}}`
 * piscar. Enquanto a leitura não voltou, nada é perguntado e o texto usa o
 * fallback: uma frase com um nome plausível é melhor do que um esqueleto.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getMyPersonalization, saveMyPersonalization } from '@/services/personalization.service';
import type { PersonalizationValues } from '@/types/personalization';
import { DISMISSED_KEY } from '@/utils/personalization';
import { PersonalizationContext } from './personalizationPort';

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [dismissedNow, setDismissedNow] = useState(false);
  const { data, isSuccess } = useQuery({
    queryKey: queryKeys.personalization.mine,
    queryFn: getMyPersonalization,
    staleTime: Infinity,
  });

  const save = useCallback(
    async (next: PersonalizationValues) => {
      const saved = await saveMyPersonalization(next);
      // O que a tela passa a mostrar é o que o service devolveu (já saneado),
      // não o que foi digitado — senão banco e tela discordam em silêncio.
      if (saved) queryClient.setQueryData(queryKeys.personalization.mine, saved);
    },
    [queryClient]
  );

  const values = useMemo(() => data ?? {}, [data]);
  // O estado local cobre o instante entre o clique e a gravação, e também o
  // caso de a gravação falhar: recusa que não pega efeito na hora vira o mesmo
  // formulário de novo na atividade seguinte.
  const dismissed = dismissedNow || values[DISMISSED_KEY] === '1';

  const port = useMemo(
    () => ({
      values,
      ready: isSuccess,
      mayAsk: isSuccess && !dismissed,
      save,
      dismiss: () => {
        setDismissedNow(true);
        void save({ ...values, [DISMISSED_KEY]: '1' });
      },
    }),
    [values, isSuccess, dismissed, save]
  );

  return (
    <PersonalizationContext.Provider value={port}>{children}</PersonalizationContext.Provider>
  );
}
