/**
 * A atividade com o elenco do aluno dentro.
 *
 * Vive aqui, e não no `ActivityRenderer`, porque o caminho ao vivo tem um ramo
 * que NÃO passa por ele (`LiveActivityRenderer` despacha o sandbox BYOC direto).
 * Substituir só no renderer base deixaria o aluno da aula ao vivo lendo
 * `{{familiar.nome}}` cru na tela.
 */
import { useMemo } from 'react';
import type { Activity } from '@/types/content';
import { personalizeSpec } from '@/utils/personalization';
import { usePersonalization } from './personalizationPort';

export function usePersonalizedActivity(activity: Activity): Activity {
  const { values } = usePersonalization();
  return useMemo(() => {
    const spec = personalizeSpec(activity.spec, values);
    return spec === activity.spec ? activity : { ...activity, spec };
  }, [activity, values]);
}
