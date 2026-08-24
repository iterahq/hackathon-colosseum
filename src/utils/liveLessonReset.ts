/**
 * "Resetar a lição para todos" — o INSTANTE DE CORTE de uma aula ao vivo.
 *
 * O Tainan, depois de uma aula no Educar+: *"quando eu quero repetir uma lição
 * na aula ao vivo, não tem como — os alunos já responderam e não dá pra
 * refazer"*.
 *
 * ⚠️ POR QUE UM CORTE, E NÃO UM DELETE. `itera.class_answers` não tem policy de
 * DELETE para o instrutor, e criar uma exigiria migration — que neste repo
 * APLICA na produção da Itera no merge (ver CLAUDE.md → Contracts/Schema). Então
 * o reset não apaga nada: ele marca um instante, e a agregação da aula passa a
 * contar só quem respondeu DEPOIS dele. A linha velha continua no banco, íntegra
 * para o relatório pós-aula (`classReport.service`), que de propósito NÃO lê
 * este corte — o professor quer poder repetir o exercício sem perder o histórico
 * de quem já tinha respondido.
 *
 * Isso funciona porque `recordClassAnswer` é um UPSERT em
 * (session_id, activity_id, user_id) que reescreve `created_at`: o aluno que
 * responder de novo volta a contar sem precisar de linha nova — que é bom,
 * porque a PK não deixaria ele inserir uma segunda.
 *
 * O corte mora no CLIENTE DO PROFESSOR (localStorage, escopo aluno+sessão pelo
 * `scopedKey` de sempre) porque é ele quem manda na aula e é a tela dele que
 * precisa sobreviver a um refresh no meio da aula. Os alunos não guardam corte:
 * eles recebem o broadcast e limpam o próprio estado local na hora.
 */
import { scopedKey } from '@/utils/storageScope';
import { clearCodeSnapshot, clearGuidedBlanks } from '@/services/codeSnapshot.service';
import { clearStoredAnswers } from '@/utils/liveAnswerStorage';

const keyFor = (sessionId: string) => scopedKey('itera.live.reset', sessionId);

/** O último corte desta sessão, ou `null` se o professor nunca resetou. */
export function readLessonResetAt(sessionId: string): string | null {
  if (!sessionId) return null;
  const key = keyFor(sessionId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

export function storeLessonResetAt(sessionId: string, at: string): void {
  if (!sessionId || !at) return;
  const key = keyFor(sessionId);
  if (!key) return;
  try {
    localStorage.setItem(key, at);
  } catch {
    // Storage indisponível — o corte vale só nesta aba, que é a degradação certa.
  }
}

/**
 * O lado do ALUNO do reset: esquecer tudo que faria a lição reabrir já feita.
 *
 * São três depósitos porque o aluno tem três: o rascunho do editor, os blanks
 * guiados e a resposta ao vivo. Deixar qualquer um deles de fora devolve o aluno
 * à atividade com o trabalho antigo na tela — que é exatamente o "não dá pra
 * refazer" que o reset existe pra resolver.
 */
export function clearLearnerLessonState(sessionId: string, activityIds: string[]): void {
  if (activityIds.length === 0) return;
  for (const activityId of activityIds) {
    clearCodeSnapshot(activityId);
    clearGuidedBlanks(activityId);
  }
  clearStoredAnswers(sessionId, activityIds);
}

/**
 * Esta resposta ainda conta depois do corte?
 *
 * Sem corte, tudo conta — é a aula que nunca foi resetada, o caso de sempre.
 * Uma linha SEM `created_at` não conta quando há corte: não dá pra provar que
 * ela é nova, e o ponto do reset é a turma começar de novo. Uma data ilegível
 * (dos dois lados) conta, porque descartar por não saber ler esconderia resposta
 * de aluno que respondeu.
 */
export function answerCountsAfterReset(
  createdAt: string | null | undefined,
  resetAt: string | null
): boolean {
  if (!resetAt) return true;
  const cut = Date.parse(resetAt);
  if (Number.isNaN(cut)) return true;
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return true;
  return at >= cut;
}
