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
