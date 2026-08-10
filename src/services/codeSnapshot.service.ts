/**
 * Debounced autosave of the learner's code-snack source, and the read side that
 * gives that work back to the learner. This reuses the SAME client-persistence
 * convention as `liveAnswerStorage` (per-activity, localStorage, survives
 * refresh) rather than inventing a new table or DB migration — `class_answers`
 * carries no free-text column, so the code text lives client-side and the answer
 * ROW is recorded via the existing `recordClassAnswer` path on completion.
 *
 * The reader that justifies saving at all is the LEARNER: `useCodeSnack` seeds
 * the editor from here, because a refresh, a dropped connection or a restored
 * tab mid-class used to send them back to the starter.
 *
 * ⚠️ The class STAGE is no longer a reader of this — it reads the volatile
 * `codeLiveBuffer.service` and only falls back here when the learner's editor
 * is not mounted. Do not route the stage back through this module: the write is
 * gated on the first keystroke on purpose, and that gate is exactly what used
 * to project a placeholder for anyone who had merely opened the exercise.
 *
 * ⚠️ O rascunho é do aluno E DA EXECUÇÃO desde 06/08 (ver
 * `utils/activityExecution`): dentro da mesma aula um refresh devolve o
 * trabalho, mas uma aula NOVA nasce no starter em vez de trazer o código da
 * turma anterior. A etiqueta é gravada no envelope e conferida na LEITURA — o
 * dado velho continua em disco e é simplesmente sobrescrito no primeiro save.
 *
 * Padrão do projeto: no React here — pure functions returning values.
 */
import { scopedKey } from '@/utils/storageScope';
import { belongsToExecution, currentExecutionId } from '@/utils/activityExecution';
import type { CodeSnapshot } from '@/types/codeSnack';

export type { CodeSnapshot } from '@/types/codeSnack';

const keyFor = (activityId: string) => scopedKey('itera.code.snapshot', activityId);

/**
 * Fired on every autosave AND on every clear. The live session page listens so it
 * can presence-track "this learner has work in progress" — a DOM event keeps the
 * signal decoupled (no callback threaded through ActivityRenderer just to reach
 * the live layer). Clearing fires it too so the professor's picker walks back to
 * "ainda não começou" instead of advertising work that no longer exists.
 */
export const CODE_SNAPSHOT_EVENT = 'itera:code-snapshot-saved';

export function readCodeSnapshot(activityId: string): CodeSnapshot | null {
  if (!activityId) return null;
  const key = keyFor(activityId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && typeof (parsed as CodeSnapshot).code === 'string') {
      const snapshot = parsed as CodeSnapshot;
      // Rascunho de outra execução não é meu: a atividade nasce limpa.
      if (!belongsToExecution(snapshot.execution, currentExecutionId())) return null;
      return snapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCodeSnapshot(activityId: string, code: string): void {
  if (!activityId) return;
  const key = keyFor(activityId);
  if (!key) return;
  try {
    const snapshot: CodeSnapshot = {
      code,
      savedAt: new Date().toISOString(),
      execution: currentExecutionId(),
    };
    localStorage.setItem(key, JSON.stringify(snapshot));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CODE_SNAPSHOT_EVENT, { detail: { activityId } }));
    }
  } catch {
    // Storage unavailable (private mode/quota) — autosave degrades only.
  }
}

/**
 * Drop the saved work for one activity. Used by "Recomeçar do código inicial":
 * without it the next reload would resurrect exactly what the learner just chose
 * to throw away — the restore we added would work against them.
 */
export function clearCodeSnapshot(activityId: string): void {
  if (!activityId) return;
  const key = keyFor(activityId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CODE_SNAPSHOT_EVENT, { detail: { activityId } }));
    }
  } catch {
    // Storage unavailable — there is nothing persisted to clear either.
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GUIDED VARIANTS' SECOND SLOT
 * ─────────────────────────────────────────────────────────────────────────────
 * A guided template saves the substituted SOURCE under the key above — which is
 * what keeps the professor's stage projecting real code without knowing guided
 * exists — plus the learner's ANSWERS BY BLANK ID here, because a substituted
 * source cannot be reversed into which chip went into which hole.
 *
 * Same execution stamping and the same per-learner scope, on purpose: the two
 * halves of one draft must expire together, or a new class would put yesterday's
 * chips back into today's starter.
 *
 * NO `CODE_SNAPSHOT_EVENT` here. The pane writes both halves in the same tick and
 * the source write already fired it; a second event would make the professor's
 * picker flicker for one draft.
 */
const blanksKeyFor = (activityId: string) => scopedKey('itera.code.blanks', activityId);

/** The raw JSON the package handed us, or `null` for another execution's draft. */
export function readGuidedBlanks(activityId: string): string | null {
  if (!activityId) return null;
  const key = blanksKeyFor(activityId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    const envelope = parsed as { blanks?: string; execution?: string | null };
    if (typeof envelope.blanks !== 'string') return null;
    if (!belongsToExecution(envelope.execution, currentExecutionId())) return null;
    return envelope.blanks;
  } catch {
    return null;
  }
}

export function saveGuidedBlanks(activityId: string, blanks: string): void {
  if (!activityId) return;
  const key = blanksKeyFor(activityId);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        blanks,
        savedAt: new Date().toISOString(),
        execution: currentExecutionId(),
      }),
    );
  } catch {
    // Storage unavailable (private mode/quota) — autosave degrades only.
  }
}

export function clearGuidedBlanks(activityId: string): void {
  if (!activityId) return;
  const key = blanksKeyFor(activityId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable — there is nothing persisted to clear either.
  }
}
