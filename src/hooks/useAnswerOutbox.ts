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
import { persistActivityProgress } from '@/services/progress.service';
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
