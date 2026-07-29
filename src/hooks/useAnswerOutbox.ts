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
