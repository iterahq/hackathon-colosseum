/**
 * Liga a fila do `answerOutbox` às escritas de verdade.
 *
 * Drena na montagem (a rede pode ter voltado enquanto o app estava fechado) e a
 * cada evento `online`. Não há polling: `online` é justamente o sinal que o
 * navegador já dá de graça, e uma aula ao vivo não precisa de um timer extra
 * competindo com o realtime.
 */
import { useCallback, useEffect } from 'react';
import { flushOutbox, enqueueWrite } from '@/utils/answerOutbox';
import type { OutboxEntry } from '@/types/answerOutbox';
import {
  persistActivityAbandonment,
  persistActivityProgress,
} from '@/services/progress.service';
import { recordClassAnswer } from '@/services/classReport.service';

/**
 * Uma drenagem por vez no app inteiro. Montar duas telas ou receber `online`
 * duas vezes seguidas não pode fazer a mesma entrada ser enviada em paralelo —
 * as duas leriam a fila antes de qualquer uma regravá-la.
 */
let flushing = false;

export async function sendOutboxEntry(entry: OutboxEntry): Promise<boolean> {
  if (entry.kind === 'progress') {
    return persistActivityProgress(entry.activityId, {
      passed: entry.passed,
      response: entry.response,
      // `?? null` cobre a entrada antiga da fila (serializada antes de a duração
      // existir): vira NULL no banco, que é a verdade — não foi medida.
      duration: entry.duration ?? null,
      // ⚠️ O instante em que o ALUNO respondeu, viajando junto com a entrada —
      // NÃO `Date.now()` aqui. Este ponto é o dreno da fila, que numa queda de
      // rede acontece muito depois da resposta; carimbar aqui dataria o trace
      // da reconexão. Entrada antiga (sem o campo) ⇒ sem âncora ⇒ sem trace.
      settledAt: entry.settledAt ?? null,
      // A sequência viaja com a entrada em wall clock, então rebaseia na origem
      // da TENTATIVA mesmo drenando horas depois. Entrada antiga (serializada
      // antes do campo) volta sem ela ⇒ trace de duas ações, que é a verdade
      // sobre o que aquele build observou.
      actions: entry.actions,
      actionsTruncated: entry.actionsTruncated,
      // O enunciado como o ALUNO leu, capturado na tentativa e carregado pela
      // fila (migration 0037). Não pode ser buscado aqui: o `spec` é mutável e
      // este ponto pode ser horas depois — releria a redação de agora, que é
      // exatamente a divergência que o snapshot existe pra impedir. Entrada
      // antiga (ou aparada por tamanho) volta sem ele ⇒ coluna NULL, que
      // significa "não capturado" e é a verdade.
      specSnapshot: entry.specSnapshot,
      // O que a atividade EXERCITAVA, carimbado na tentativa e carregado pela
      // fila (migration 0038). Buscar aqui — ou pior, no join da análise —
      // daria a gramática de hoje a uma tentativa de meses atrás, e a gramática
      // é justamente o que o ADR-5 faz mudar. Entrada antiga (ou aparada por
      // tamanho) volta sem ele ⇒ coluna NULL ⇒ "não capturado".
      pedagogicalContext: entry.pedagogicalContext,
    });
  }
  if (entry.kind === 'abandonment') {
    // A tentativa que o aluno abriu e largou (migration 0040). Escreve UMA
    // tabela — `activity_traces` — e nenhuma outra: `activity_results` é log de
    // TENTATIVA, e um abandono ali contaria não-tentativa como erro.
    //
    // ⚠️ Devolver `false` aqui MANTÉM a entrada na fila, e é o comportamento
    // desejado na janela em que o build está no ar e a coluna `outcome` ainda
    // não: o abandono ESPERA em vez de virar uma linha que se lê como tentativa
    // respondida. Desde 2026-08-04 o merge aplica a migration (`db-apply`), mas
    // o deploy e o apply correm em paralelo — a janela virou minutos, não dias,
    // e o dreno seguinte pega. `flushOutbox` nunca descarta por tentativas.
    return persistActivityAbandonment(entry.activityId, {
      startedAt: entry.startedAt,
      leftAt: entry.leftAt,
      duration: entry.duration ?? null,
      reason: entry.reason,
      actions: entry.actions,
      actionsTruncated: entry.actionsTruncated,
      // As mesmas duas anotações da linha de tentativa, viajando pela fila pelo
      // mesmo motivo: o `spec` é mutável e a tag pedagógica é FEITA pra mudar
      // (ADR-5), então nenhuma das duas pode ser buscada no dreno.
      specSnapshot: entry.specSnapshot,
      pedagogicalContext: entry.pedagogicalContext,
    });
  }
  return recordClassAnswer(entry.sessionId, entry.activityId, entry.correct, entry.elapsedMs);
}

export async function drainAnswerOutbox(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    return await flushOutbox(sendOutboxEntry);
  } finally {
    flushing = false;
  }
}

/**
 * Tenta a escrita AGORA e enfileira só o que falhou. O caminho feliz — a
 * esmagadora maioria — continua sendo uma escrita direta, sem passar por
 * localStorage.
 */
export async function writeOrQueue(entry: OutboxEntry): Promise<boolean> {
  const ok = await sendOutboxEntry(entry);
  if (!ok) enqueueWrite(entry);
  return ok;
}

export function useAnswerOutbox(): { drain: () => void } {
  const drain = useCallback(() => {
    void drainAnswerOutbox();
  }, []);

  useEffect(() => {
    drain();
    window.addEventListener('online', drain);
    return () => window.removeEventListener('online', drain);
  }, [drain]);

  return { drain };
}
