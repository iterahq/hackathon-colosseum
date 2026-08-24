/**
 * Local persistence of the learner's OWN answers in a live session, so a page
 * refresh can't re-open an already-answered activity (re-answering re-fired the
 * broadcast and reset the professor's aggregates — 1st-class bug #5). Keyed per
 * session; localStorage so it survives refresh and accidental tab close.
 */
import { scopedKey } from '@/utils/storageScope';
import type { StoredLiveAnswer } from '@/types/liveClass';

export type { StoredLiveAnswer } from '@/types/liveClass';

const keyFor = (sessionId: string) => scopedKey('itera.live.answers', sessionId);

function readAll(sessionId: string): Record<string, StoredLiveAnswer> {
  const key = keyFor(sessionId);
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredLiveAnswer>) : {};
  } catch {
    return {};
  }
}

export function readStoredAnswer(sessionId: string, activityId: string): StoredLiveAnswer | null {
  const entry = readAll(sessionId)[activityId];
  return entry && typeof entry.correct === 'boolean' ? entry : null;
}

export function storeAnswer(
  sessionId: string,
  activityId: string,
  answer: StoredLiveAnswer
): void {
  const key = keyFor(sessionId);
  if (!key) return;
  try {
    const all = readAll(sessionId);
    all[activityId] = answer;
    localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // Storage unavailable (private mode/quota) — refresh protection degrades only.
  }
}

/**
 * Esquece as respostas destas atividades — "resetar a lição para todos". A
 * proteção contra refresh acima é EXATAMENTE o que impede a turma de refazer o
 * exercício, então repetir a lição passa por aqui. Por ATIVIDADE, e não apagando
 * a chave da sessão inteira, porque o corte é da LIÇÃO: o que não está na lista
 * continua valendo.
 */
export function clearStoredAnswers(sessionId: string, activityIds: string[]): void {
  const key = keyFor(sessionId);
  if (!key || activityIds.length === 0) return;
  try {
    const all = readAll(sessionId);
    for (const activityId of activityIds) delete all[activityId];
    localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // Storage unavailable — não havia nada persistido pra limpar também.
  }
}
