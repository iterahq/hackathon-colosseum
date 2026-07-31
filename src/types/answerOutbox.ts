/** Contratos da fila durável de escritas de resposta (`src/utils/answerOutbox.ts`). */

import type { DurationSample } from '@/utils/activityDuration';

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
