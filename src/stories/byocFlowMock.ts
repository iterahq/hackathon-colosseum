/**
 * O `useByoc` sem rede, para a story do fluxo completo do BYOC.
 *
 * Mesma superfície (`ByocState`), geração vinda de um `setTimeout`. Ter a MESMA
 * superfície é o ponto: se o estado real ganhar uma fase, isto para de compilar
 * em vez de mostrar na vitrine um fluxo que não existe mais.
 *
 * As três diferenças entre `reset` e `tryAnotherSeed` do `useByoc` são imitadas
 * aqui de propósito, porque colapsá-las é o jeito silencioso de a vitrine mentir:
 * `reset` RELÊ (passa por `loading` e volta pra linha que o servidor já tem),
 * `tryAnotherSeed` não relê (a linha que ele acharia é justamente a reserva que o
 * aluno quer trocar), e a falha PERSISTE uma linha degradada em vez de deixar
 * `generation` nula — estado que a itera-api não produz.
 *
 * ⚠️ A espera é fake e curta. Em produção a geração leva 47–58s contra o modelo
 * free; 2,2s aqui é só pra a story ser navegável — não é medição de latência.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ByocSpec, GeneratedChoiceTree } from '@iterahq/activity-spec';
import type { ByocPhase, ByocState } from '@/components/branded/activity/byoc/useByoc';
import type { ByocGeneration } from '@/types/byoc';
import { makeActivity } from './activityFixtures';
import { byocFallbackGeneration, byocGeneration } from './byocFixtures';

const MOCK_LATENCY_MS = 2200;
const MOCK_READ_MS = 600;

export function useMockByoc({
  tree,
  fallback,
  failing = false,
}: {
  tree: GeneratedChoiceTree;
  fallback?: GeneratedChoiceTree;
  failing?: boolean;
}): ByocState {
  const [phase, setPhase] = useState<ByocPhase>('seed');
  const [generation, setGeneration] = useState<ByocGeneration | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persisted = useRef<ByocGeneration | null>(null);
  const schedule = useCallback((ms: number, run: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, ms);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const submitSeed = useCallback(
    (seed: string) => {
      setPhase('generating');
      schedule(MOCK_LATENCY_MS, () => {
        if (failing && !fallback) {
          persisted.current = null;
          setPhase('unavailable');
          return;
        }
        const row =
          failing && fallback
            ? byocFallbackGeneration(seed, fallback)
            : byocGeneration(seed, tree);
        persisted.current = row;
        setGeneration(row);
        setPhase(row.fallback_used ? 'fallback' : 'ready');
      });
    },
    [failing, fallback, schedule, tree]
  );

  const reset = useCallback(() => {
    setGeneration(null);
    setPhase('loading');
    schedule(MOCK_READ_MS, () => {
      const row = persisted.current;
      setGeneration(row);
      if (!row) {
        setPhase('seed');
        return;
      }
      setPhase(row.fallback_used ? 'fallback' : 'ready');
    });
  }, [schedule]);

  const tryAnotherSeed = useCallback(() => {
    persisted.current = null;
    setGeneration(null);
    setPhase('seed');
  }, []);

  return { phase, generation, seedError: null, submitSeed, reset, tryAnotherSeed };
}

/**
 * A camada precisa de um host: `byoc` mora em `spec.byoc` sobre um kind que já
 * existe, e a `instruction` do host é carregada pra dentro da camada porque a
 * camada substitui o render inteiro do host.
 */
export function byocHostActivity(spec: ByocSpec) {
  return makeActivity('single_choice', {
    byoc: spec,
    instruction: {
      text: 'Antes de pedir algo pra uma IA, diga QUEM é você e o que você quer. Vamos usar uma coisa que VOCÊ gosta.',
    },
  });
}
