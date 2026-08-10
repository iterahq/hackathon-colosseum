/**
 * Gathers the content a learner replies with when the instructor pulls their
 * work to the class stage (`stage-answer`). All data is read from the learner's
 * OWN local state — no DB, no migration (the class is synchronous, the student is
 * online): the code-snack source on screen (`readCodeLiveBuffer`, falling back to
 * the saved `readCodeSnapshot`) wins and is staged as `code`; otherwise a
 * best-effort correct/wrong summary from `readStoredAnswer`.
 *
 * ADR-4 (revised 2026-07-23): the professor pulls WORK IN PROGRESS too, not only
 * finished answers — following how the class is advancing is the whole point. So
 * this NEVER returns null anymore. It always returns a `status` describing where
 * the learner is, so the pull never fails in silence (which looked to the
 * professor like a broken button). `not_started` is a statement about THIS
 * signal, not about the learner: only a code source or a submitted answer is
 * visible here, so a learner mid-way through any other kind reports it too —
 * which is why the stage projects the current activity instead of announcing it.
 * It is also NOT the same as "nothing to project": a `code` reply can be
 * `not_started` and still carry the starter the learner is staring at.
 */
import { readCodeLiveBuffer } from '@/services/codeLiveBuffer.service';
import { readCodeSnapshot } from '@/services/codeSnapshot.service';
import { readStoredAnswer } from '@/utils/liveAnswerStorage';
import type { StageContent, StageWorkStatus } from '@/types/liveClass';

export type { StageContent, StageWorkStatus } from '@/types/liveClass';

const STATUSES: StageWorkStatus[] = ['submitted', 'in_progress', 'not_started'];

/**
 * Reads a `status` off a channel payload. Defaults to `submitted` because a
 * client running the PREVIOUS build omits the field and only ever replied when it
 * had a finished answer — a mid-class deploy must not mislabel those as drafts.
 */
export function parseStageStatus(value: unknown): StageWorkStatus {
  return STATUSES.includes(value as StageWorkStatus) ? (value as StageWorkStatus) : 'submitted';
}

export function gatherStageContent(sessionId: string, activityId: string): StageContent {
  const submitted = readStoredAnswer(sessionId, activityId);
  // O buffer vivo vem PRIMEIRO porque ele existe desde o mount, enquanto o
  // snapshot só nasce depois da primeira tecla — era essa diferença que fazia o
  // aluno ter que "mexer em algo" antes do professor conseguir puxá-lo (P1).
  // O snapshot segue como fallback pro caso do buffer não existir: aba fechada,
  // outro kind na tela, cliente de build antigo. Ignorá-lo quando há buffer é
  // seguro porque o editor semeia DO snapshot — o buffer nunca é o mais velho.
  const live = readCodeLiveBuffer(activityId);
  const source = live ?? readCodeSnapshot(activityId);
  if (source) {
    return {
      kind: 'code',
      content: source.code,
      // `not_started` aqui é a verdade sobre o ALUNO (abriu e não tem trabalho)
      // sem esconder da turma o código que está na tela dele. É `hasWork`, e não
      // "digitou nesta montagem": quem recarregou a aba e teve o rascunho
      // restaurado TEM trabalho, e projetá-lo como intocado seria falso.
      status: submitted ? 'submitted' : live && !live.hasWork ? 'not_started' : 'in_progress',
    };
  }
  if (submitted) {
    // `content` segue sendo o veredito porque um cliente do build ANTERIOR lê
    // exatamente isso; `response` é o acréscimo — o que o aluno de fato marcou.
    return {
      kind: 'answer',
      content: submitted.correct ? 'correct' : 'wrong',
      status: 'submitted',
      response: submitted.response,
    };
  }
  // Nothing local at all — the learner is in the room but hasn't touched this
  // activity yet. Explicit empty state (not null) so the pull still resolves.
  return { kind: 'empty', content: '', status: 'not_started' };
}
