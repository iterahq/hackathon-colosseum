/**
 * O BYOC inteiro no canvas do Storybook: o `ByocActivityView` de produção com o
 * `useByoc` trocado pelo mock local, para que a story mostre a TRANSIÇÃO entre
 * o passo 1 (o aluno escreve o contexto) e o passo 2 (a árvore gerada).
 *
 * O aviso de latência fica no CANVAS, não só no docblock: não há página de Docs
 * gerada neste Storybook, então comentário de story é aviso que ninguém lê.
 */
import type { ByocSpec, GeneratedChoiceTree } from '@iterahq/activity-spec';
import { ByocActivityView } from '@/components/branded/activity/byoc/ByocActivityView';
import type { Activity } from '@/types/content';
import { noop } from './activityFixtures';
import { useMockByoc } from './byocFlowMock';

export function ByocFlow({
  activity,
  spec,
  tree,
  failing,
  withFallback = true,
  returning,
  refuseFirstSeed,
  note = 'Vitrine: a geração é mockada e espera 2,2s. Em produção leva ~6s ponta a ponta.',
}: {
  activity: Activity;
  spec: ByocSpec;
  tree: GeneratedChoiceTree;
  failing?: boolean;
  withFallback?: boolean;
  returning?: boolean;
  refuseFirstSeed?: boolean;
  note?: string;
}) {
  const state = useMockByoc({
    tree,
    fallback: withFallback ? spec.fallback : undefined,
    failing,
    returning,
    refuseFirstSeed,
  });
  return (
    <div>
      <p className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        {note}
      </p>
      <ByocActivityView
        activity={activity}
        spec={withFallback ? spec : { ...spec, fallback: undefined }}
        onComplete={noop}
        state={state}
      />
    </div>
  );
}
