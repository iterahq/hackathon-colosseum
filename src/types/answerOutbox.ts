/** Contratos da fila durável de escritas de resposta (`src/utils/answerOutbox.ts`). */

import type { DurationSample } from '@/utils/activityDuration';
import type { RecordedAction } from '@/utils/learningTrace';

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
    }
  | {
      kind: 'classAnswer';
      sessionId: string;
      activityId: string;
      correct: boolean;
      elapsedMs: number;
    };

/** A entrada como ela vive na fila. */
export interface QueuedWrite {
  id: string;
  entry: OutboxEntry;
  /** Quantas vezes já tentamos enviar — diagnóstico, nunca critério de descarte. */
  attempts: number;
  queuedAt: number;
}
