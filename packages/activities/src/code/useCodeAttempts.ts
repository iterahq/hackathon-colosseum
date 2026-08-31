import { useCallback, useEffect, useRef, useState } from 'react';
import { useActivityStorage } from '../context.js';
import {
  attemptBudget,
  codeAttemptsKey,
  parseSpentAttempts,
  serializeSpentAttempts,
  spendAttempt,
  CODE_ATTEMPTS_REFRESH_EVENT,
  type AttemptBudget,
} from './attemptBudget.js';

/**
 * As vidas de UMA atividade `code`, ligadas ao depósito do host.
 *
 * Semeado dentro do `useState`, como o rascunho do editor: o primeiro paint já
 * sai com o saldo verdadeiro. Semear com três e corrigir num efeito mostraria
 * "3 tentativas" por um frame para quem já gastou duas — e é justamente na hora
 * do F5 que o aluno está olhando para esse número.
 *
 * ⚠️ A ESCRITA É NA HORA, sem debounce. O rascunho pode se dar ao luxo de
 * esperar 600ms porque perder o último caractere digitado custa um caractere;
 * perder o registro de uma tentativa custa a regra inteira — um F5 na tela de
 * veredito devolveria a vida que o aluno acabou de gastar, que é exatamente o
 * "dá pra enviar quantas quiser" que isto veio resolver.
 */
export interface CodeAttempts extends AttemptBudget {
  spend: () => void;
}

export function useCodeAttempts(activityId: string): CodeAttempts {
  const storage = useActivityStorage();
  // Pelo ref, e não pelas deps, pelo mesmo motivo de `useCodeSnack`: um host que
  // reconstrói o adapter a cada render re-leria o disco no meio do exercício.
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const [spent, setSpent] = useState(() =>
    parseSpentAttempts(storage.read(codeAttemptsKey(activityId))),
  );
  const spentRef = useRef(spent);
  spentRef.current = spent;

  useEffect(() => {
    const reread = () => {
      const next = parseSpentAttempts(storageRef.current.read(codeAttemptsKey(activityId)));
      spentRef.current = next;
      setSpent(next);
    };
    reread();
    if (typeof window === 'undefined') return;
    window.addEventListener(CODE_ATTEMPTS_REFRESH_EVENT, reread);
    return () => window.removeEventListener(CODE_ATTEMPTS_REFRESH_EVENT, reread);
  }, [activityId]);

  const spend = useCallback(() => {
    const next = spendAttempt(spentRef.current);
    spentRef.current = next;
    storageRef.current.write(codeAttemptsKey(activityId), serializeSpentAttempts(next));
    setSpent(next);
  }, [activityId]);

  return { ...attemptBudget(spent), spend };
}
