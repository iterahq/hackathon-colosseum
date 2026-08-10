/**
 * PARTLY MOVED — the `code` kind's types now live in
 * `@iterahq/activities/code` (Fase C, step 5) and are re-exported here so the
 * app's import path keeps resolving.
 *
 * `CodeSnapshot` did NOT move, and that is the interesting half. It is the
 * envelope the PLAYER writes to `localStorage` (`{ code, savedAt }`) through
 * `codeSnapshot.service` — an on-disk shape owned by this app's persistence,
 * read by the professor's stage as well as by the learner. The package's
 * storage port speaks plain strings on purpose, so shipping the envelope would
 * have been the package dictating how every consumer stores a draft.
 */
export type {
  CodeCheckResult,
  CodeChecksRequest,
  CodeSnackPhase,
  TranspileResult,
  UseCodeSnackCallbacks,
} from '@iterahq/activities/code';

export interface CodeSnapshot {
  code: string;
  savedAt: string;
  /**
   * Qual EXECUÇÃO gravou este rascunho (ver `utils/activityExecution`). Vai no
   * payload e não na chave de propósito: chave por execução deixaria um rascunho
   * órfão em disco por aula dada, e um rascunho gravado ANTES desta regra não
   * teria como ser reconhecido como legado — seria só inalcançável.
   */
  execution?: string | null;
}

/**
 * The source on the learner's screen right now — see `codeLiveBuffer.service`
 * for why this is separate from `CodeSnapshot`. `hasWork` is the difference
 * between *"opened the exercise"* and *"there is work here"*: it is what the
 * stage badge and the professor's presence signal actually need, and a snapshot
 * restored after a reload counts as work even though nobody typed this mount.
 *
 * Stayed here for the same reason `CodeSnapshot` did: this is the shape the
 * PLAYER's in-memory buffer keeps and the professor's stage reads. The package
 * publishes into it through `ActivityLiveBufferPort`, which speaks the two
 * fields as plain arguments — so no consumer inherits the Itera's idea of what
 * a live buffer is.
 */
export interface CodeLiveBuffer {
  code: string;
  hasWork: boolean;
}
