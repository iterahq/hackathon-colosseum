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
 * ⚠️ A espera é fake. 2,2s aqui só imita a ordem de grandeza da produção pós
 * itera-api#37 (~6s ponta a ponta) — não é medição.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ByocSpec, GeneratedChoiceTree } from '@iterahq/activity-spec';
import type { ByocPhase, ByocState } from '@/components/branded/activity/byoc/useByoc';
import type { ByocGeneration } from '@/types/byoc';
import { makeActivity } from './activityFixtures';
import { byocFallbackGeneration, byocGeneration } from './byocFixtures';

const MOCK_LATENCY_MS = 2200;
const MOCK_READ_MS = 600;

/**
 * Cópia VERBATIM do `SEED_REJECTED_MESSAGE` da itera-api (`src/byoc/safety.ts`) —
 * a vitrine mostra a frase que o aluno realmente lê, não uma paráfrase.
 *
 * Recusa NÃO é acusação: o leitor é adolescente iniciante que pode ter escrito
 * algo pesado sem querer, e a mensagem nunca diz qual termo disparou o filtro.
 */
const REFUSAL =
  'Vamos escolher outro tema para essa atividade? Conte algo que você gosta de fazer — ' +
  'um esporte, uma música, um jogo, uma comida, um lugar que você curte.';

export function useMockByoc({
  tree,
  fallback,
  failing = false,
  returning = false,
  refuseFirstSeed = false,
}: {
  tree: GeneratedChoiceTree;
  fallback?: GeneratedChoiceTree;
  failing?: boolean;
  /**
   * O aluno que JÁ gerou e voltou. É a entrada mais comum depois da primeira
   * tentativa, e a primeira pintura que todo aluno vê: o real `useByoc` nasce em
   * `loading`, lê, e cai direto na árvore — nunca no formulário de seed.
   */
  returning?: boolean;
  /**
   * Recusa a PRIMEIRA seed, seja ela qual for, pra exercitar o `seedError` e a
   * volta ao passo 1. Em produção quem decide é a triagem determinística da
   * itera-api (`byoc/safety.ts`), mas reproduzir a lista de termos aqui poria
   * exatamente o vocabulário proibido dentro da vitrine — o gatilho é imitado,
   * a tela é a real.
   */
  refuseFirstSeed?: boolean;
}): ByocState {
  const [phase, setPhase] = useState<ByocPhase>(returning ? 'loading' : 'seed');
  const [generation, setGeneration] = useState<ByocGeneration | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persisted = useRef<ByocGeneration | null>(
    returning ? byocGeneration('faço bolo de cenoura pra vender no bairro', tree) : null
  );
  // Ref, e não estado: a recusa tem que valer UMA vez por montagem. Um contador em
  // `useState` re-renderiza (e a story voltaria a recusar a segunda tentativa);
  // um flag em closure da story reiniciaria a cada render.
  const refused = useRef(false);
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

  // A leitura de montagem do aluno que volta, igual à do `useByoc`: `loading` e
  // então já a árvore, sem passar pelo formulário.
  useEffect(() => {
    if (!returning) return;
    const id = setTimeout(() => {
      const row = persisted.current;
      setGeneration(row);
      setPhase(row ? (row.fallback_used ? 'fallback' : 'ready') : 'seed');
    }, MOCK_READ_MS);
    return () => clearTimeout(id);
  }, [returning]);

  const submitSeed = useCallback(
    (seed: string) => {
      if (refuseFirstSeed && !refused.current) {
        refused.current = true;
        setSeedError(REFUSAL);
        setPhase('seed');
        return;
      }
      setSeedError(null);
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
    [failing, fallback, refuseFirstSeed, schedule, tree]
  );

  const reset = useCallback(() => {
    setGeneration(null);
    // O `useByoc` real limpa o erro de seed ao reler; sem isto a recusa
    // sobreviveria a uma releitura bem-sucedida — a vitrine mostrando um estado
    // que a produção não produz.
    setSeedError(null);
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
    setSeedError(null);
    setPhase('seed');
  }, []);

  return { phase, generation, seedError, submitSeed, reset, tryAnotherSeed };
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
