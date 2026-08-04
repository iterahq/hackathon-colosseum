/** Contratos da fila durável de escritas de resposta (`src/utils/answerOutbox.ts`). */

import type { AbandonmentReason } from '@/utils/abandonment';
import type { DurationSample } from '@/utils/activityDuration';
import type { RecordedAction, TraceSpecSnapshot } from '@/utils/learningTrace';
import type { PedagogicalContext } from '@/utils/pedagogicalContext';

/** Uma escrita pendente. A união é fechada — kind novo obriga a tratar o envio. */
export type OutboxEntry =
  | {
      kind: 'progress';
      activityId: string;
      passed: boolean;
      response: string | null;
      /**
       * Quanto tempo o aluno ficou na atividade (`src/utils/activityDuration.ts`).
       *
       * OPCIONAL só por compatibilidade com a fila: uma entrada serializada em
       * localStorage ANTES deste campo existir volta sem ele quando a rede
       * finalmente cai de volta, e descartar aquela resposta pra não perder a
       * telemetria seria trocar o dado que importa pelo dado que enfeita.
       * Ausente vira NULL no banco — "não medido", nunca zero.
       *
       * ⚠️ A duração é medida no instante em que o aluno RESPONDE, não quando a
       * fila drena: o valor viaja junto com a entrada justamente porque o tempo
       * entre responder e a rede voltar não é tempo de atividade.
       */
      duration?: DurationSample | null;
      /**
       * O INSTANTE (wall clock) em que o aluno respondeu — âncora do trace de
       * eventos (`itera.activity_traces`, migration 0034).
       *
       * ⚠️ Carimbado NA ORIGEM e carregado pela fila, nunca gerado na hora da
       * escrita. Uma entrada que ficou 40min esperando a rede voltar seria
       * datada da RECONEXÃO se usássemos `Date.now()` no fim — e um trace de
       * aprendizagem cujo relógio é o da rede não é um trace de aprendizagem.
       *
       * De quebra é o que torna o reenvio idempotente: a mesma tentativa deriva
       * o mesmo `started_at`, e o índice único (user, activity, started_at)
       * transforma a segunda escrita em no-op em vez de duplicar a sequência.
       *
       * OPCIONAL pela mesma razão que `duration`: entrada serializada antes do
       * campo existir volta sem ele. Ausente ⇒ tentativa gravada, trace NÃO —
       * âncora inventada é pior que âncora nenhuma.
       */
      settledAt?: number;
      /**
       * A SEQUÊNCIA do que o aluno fez (`RecordedAction[]`, wall clock) — o
       * COMO, onde `response` é o QUÊ. Famílias `selection`/`arrangement`
       * mandam; as outras não (`src/utils/activityFamilies.ts`).
       *
       * ⚠️ Wall clock e não offset, de propósito: a entrada pode dormir horas
       * na fila e ainda assim é rebaseada na origem da tentativa, não na
       * reconexão. Mesmo argumento do `settledAt` acima.
       *
       * ⚠️ APARADA NA ENFILEIRADA (`MAX_QUEUED_TRACE_ACTIONS`). A fila cabe 200
       * entradas e o localStorage estoura por volta de 5 MB; 200 × 500 ações
       * passaria disso e derrubaria a persistência local INTEIRA — inclusive as
       * respostas que a fila existe pra salvar. Trace aparado é perda de
       * telemetria; quota estourada é perda de resposta de aluno.
       */
      actions?: RecordedAction[];
      /** A sequência foi aparada antes de chegar no banco (ver acima). */
      actionsTruncated?: boolean;
      /**
       * O ENUNCIADO que o aluno leu, já resolvido pro locale dele, capturado no
       * instante da tentativa (migration 0037 — Fase 0 do plano
       * `20260803-itera-replay-de-sessao-de-atividade`).
       *
       * ⚠️ VIAJA PELA FILA, e por um motivo mais forte que o dos outros campos:
       * `itera.activities.spec` é MUTÁVEL (trigger `activity_defs_sync_instances`,
       * migration 0024) e a entrada enfileirada pode drenar horas depois. Buscar
       * o spec no dreno traria a redação de ENTÃO, não a de quando o aluno
       * respondeu — que é exatamente a divergência que a Fase 0 existe pra
       * fechar. A entrada offline é, aliás, o caso onde a janela pra uma edição
       * de curador acontecer no meio é maior.
       *
       * ⚠️ DESCARTADO NA ENFILEIRADA quando é grande demais
       * (`MAX_QUEUED_SPEC_SNAPSHOT_CHARS`). Mesma aritmética do
       * `MAX_QUEUED_TRACE_ACTIONS`: 200 entradas × um spec de 8 kB encostaria na
       * quota do localStorage, e estourar a quota derruba a fila INTEIRA —
       * inclusive as respostas que ela existe pra salvar. Descartado, nunca
       * truncado: meio enunciado não é um enunciado, e a coluna NULL já quer
       * dizer "não capturado", que é a verdade.
       *
       * OPCIONAL pelo mesmo motivo que `duration`/`settledAt`: entrada
       * serializada antes do campo existir volta sem ele.
       */
      specSnapshot?: TraceSpecSnapshot;
      /**
       * O CONTEXTO PEDAGÓGICO da tentativa — template, família, estruturas
       * mentais, metáfora, dificuldade, objetivo (migration 0038, Fase 1 do
       * plano `20260803-itera-learning-control-plane-prototipo`).
       *
       * ⚠️ VIAJA PELA FILA pelo mesmo motivo do `specSnapshot`, e por um motivo
       * a mais: a tag da atividade não é só mutável, ela é *feita pra mudar* —
       * o ADR-5 diz que estrutura entra e sai da gramática por poder
       * preditivo medido. Buscar a tag no dreno (ou pior, no join da análise)
       * daria a gramática de ENTÃO a uma tentativa de AGORA, e a ablação da
       * Fase 4 acabaria medindo a própria contabilidade em vez do aluno.
       *
       * ⚠️ APARADO NA ENFILEIRADA quando é grande demais
       * (`MAX_QUEUED_PEDAGOGICAL_CONTEXT_CHARS`): primeiro cai o `extra` (a
       * passagem verbatim de chaves não reconhecidas, que é a parte
       * ilimitada), e só se ainda não couber some o contexto inteiro. Os seis
       * campos normalizados custam dezenas de bytes; é o `extra` que pode
       * crescer sem teto, então é ele que sai primeiro.
       *
       * OPCIONAL pelo mesmo motivo que os outros: entrada serializada antes do
       * campo existir volta sem ele ⇒ coluna NULL ⇒ "não capturado".
       */
      pedagogicalContext?: PedagogicalContext;
    }
  | {
      kind: 'classAnswer';
      sessionId: string;
      activityId: string;
      correct: boolean;
      elapsedMs: number;
    }
  /**
   * Uma TENTATIVA ABANDONADA — a atividade foi renderizada, o aluno ficou nela e
   * saiu sem responder (migration 0040, Fase 1 do plano
   * `20260803-itera-learning-control-plane-prototipo`).
   *
   * ⚠️ POR QUE ELA É UM `kind` PRÓPRIO E NÃO UM `progress` COM UMA FLAG. Um
   * abandono NÃO escreve `activity_results` nem `progress` — escrever
   * `passed: false` contaria não-tentativa como erro e destruiria toda métrica
   * de acerto (o defeito D2 pelo avesso). O `sendOutboxEntry` de um `progress`
   * escreve as três tabelas por contrato; separar o kind é o que garante, no
   * sistema de tipos, que essa escrita não pode acontecer por engano.
   *
   * ⚠️ ESTE É O CAMINHO DE ENTREGA PRINCIPAL, não o de exceção. No teardown da
   * página um `fetch` assíncrono não tem garantia nenhuma de completar, então o
   * beacon NÃO tenta escrever direto: ele enfileira aqui (localStorage é
   * SÍNCRONO e sobrevive ao teardown) e o dreno seguinte — na próxima montagem
   * do app ou no próximo evento `online` — é quem escreve. Ver
   * `src/hooks/useAbandonmentBeacon.ts`.
   */
  | {
      kind: 'abandonment';
      activityId: string;
      /**
       * O INSTANTE EM QUE A ATIVIDADE ABRIU — a origem do trace, e a chave de
       * idempotência.
       *
       * ⚠️ É a origem DIRETA, não derivada por subtração como no `progress`
       * (que faz `settledAt - elapsedMs`). Um abandono não tem settle; quem
       * renderizou a atividade já tem esse instante na mão (é o mesmo que
       * alimenta o `useActivityDuration`).
       *
       * ⚠️ Carimbado NA ORIGEM e carregado pela fila, nunca gerado no dreno:
       * o índice único `(user_id, activity_id, started_at)` só transforma um
       * reenvio em no-op porque este valor é estável.
       */
      startedAt: number;
      /** O instante em que a superfície sumiu. Só limita a sequência. */
      leftAt: number;
      /** Quanto tempo ele ficou — ver `src/utils/activityDuration.ts`. */
      duration?: DurationSample | null;
      /** Por que a superfície sumiu (`left_activity` | `page_teardown`). */
      reason: AbandonmentReason;
      /** A sequência do que ele tocou ANTES de sair, quando a família emite. */
      actions?: RecordedAction[];
      actionsTruncated?: boolean;
      /**
       * ⚠️ AS DUAS ANOTAÇÕES SÃO OBRIGATÓRIAS NA PRÁTICA, não decorativas: uma
       * linha de abandono sem `spec_snapshot` e sem `pedagogical_context` é
       * inanalisável ao lado das linhas de tentativa, que têm as duas. "Qual
       * célula da matriz é abandonada com mais frequência" é uma pergunta sobre
       * a tag; sem ela o abandono vira um número solto.
       *
       * Opcionais no TIPO pelo mesmo motivo de sempre (entrada serializada
       * antes do campo existir), e aparadas na enfileirada pelos mesmos tetos.
       */
      specSnapshot?: TraceSpecSnapshot;
      pedagogicalContext?: PedagogicalContext;
    };

/** A entrada como ela vive na fila. */
export interface QueuedWrite {
  id: string;
  entry: OutboxEntry;
  /** Quantas vezes já tentamos enviar — diagnóstico, nunca critério de descarte. */
  attempts: number;
  queuedAt: number;
}
