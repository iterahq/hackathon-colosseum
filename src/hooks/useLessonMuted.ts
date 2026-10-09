import { useSyncExternalStore } from 'react';

const KEY = 'itera.lesson.muted';
const listeners = new Set<() => void>();

// Espelho invertido do `useLiveMuted`: ao vivo o som nasce DESLIGADO porque a
// sala é compartilhada. Na lição self-paced o aluno está sozinho, e o retorno
// sonoro ao passar o exercício é o pedido — nasce LIGADO, só '1' cala.
export function isLessonMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* storage unavailable — keep the in-tab default */
  }
  listeners.forEach((l) => l());
}

export function useLessonMuted(): [boolean, () => void] {
  const muted = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isLessonMuted,
    () => false
  );
  return [muted, () => write(!isLessonMuted())];
}
