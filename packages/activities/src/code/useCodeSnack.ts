import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useActivityStorage } from '../context.js';
import { seedCodeSource } from './codeSource.js';
import { codeDraftKey } from './draftKey.js';
import type { UseCodeSnackCallbacks } from './types.js';
import { useCodeAttempts } from './useCodeAttempts.js';
import { useCodeChecks } from './useCodeChecks.js';
import { useCodeLiveBuffer } from './useCodeLiveBuffer.js';

const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * Owns the code-snack's editable source and its persistence (autosave AND
 * restore), and — when the spec ships `checks` — hands the submit/feedback/retry
 * lifecycle to `useCodeChecks`.
 *
 * Retrocompatibility is deliberate: with no checks the hook behaves exactly as
 * before — `complete()` reports `true` and the learner just clicks Concluir.
 */
export function useCodeSnack(
  activityId: string,
  spec: CodeSpec,
  callbacks: UseCodeSnackCallbacks,
) {
  const { onComplete } = callbacks;
  // ⚠️ Read, write and clear all come from ONE port, and that is the point:
  // `UseCodeSnackCallbacks` used to expose a write-only `onAutosave` whose own
  // comment said overriding it alone hands the learner back the wrong source.
  // Now the three travel together or not at all.
  const storage = useActivityStorage();
  // Lazy init, on purpose: reading the snapshot INSIDE `useState` means the very
  // first paint already shows the learner's work. Seeding with the starter and
  // swapping it in an effect would flash the starter — mid-class that reads as
  // "my code is gone" even when it comes back a frame later.
  const [source, setSource] = useState(() => seedCodeSource(storage, activityId, spec.starter));
  const { code, hasWork } = source;
  /**
   * TWO flags, and collapsing them re-breaks something either way:
   *
   * · `hasWork` (state) — is this source the learner's, or the pristine starter?
   *   Read by the stage badge and the professor's presence signal, so a RESTORED
   *   draft counts: a learner who reloads mid-exercise must not be projected as
   *   "sem edições". State and not a ref, because the publish effect has to
   *   re-run when it flips WITHOUT the code changing (resetting an editor that
   *   already held the starter).
   *
   * · `touchedRef` — did the learner TYPE during this mount? Only that deserves
   *   a draft WRITE. Without it the debounce would write the seed back one tick
   *   after every mount, resurrecting the code a reset just discarded.
   */
  const touchedRef = useRef(false);

  const checks = useMemo(() => spec.checks ?? [], [spec.checks]);
  const hasChecks = checks.length > 0;
  const {
    phase,
    results,
    allPassed,
    timedOut,
    checksRequest,
    submit: runChecks,
    receiveResults,
    reset,
    settle,
  } = useCodeChecks(code, checks);
  /**
   * O orçamento de envios errados. Vale SÓ para o snack corrigido: sem `checks`
   * não existe "errar" — a atividade se encerra num "marcar como concluída" — e
   * gastar vida ali seria cobrar por uma pergunta que ninguém fez.
   */
  const attempts = useCodeAttempts(activityId);
  const outOfLives = hasChecks && attempts.exhausted;

  /** The editor's onChange — every learner-originated edit comes through here. */
  const setCode = useCallback((next: string) => {
    touchedRef.current = true;
    setSource({ code: next, hasWork: true });
  }, []);

  // The mirror reads THIS, not the draft — `useCodeLiveBuffer` has the measured
  // reason. The port comes back for `resetToStarter`'s ordered publish below.
  const liveBuffer = useCodeLiveBuffer(activityId, code, hasWork);

  const persist = useCallback(
    (next: string) => {
      storage.write(codeDraftKey(activityId), next);
    },
    [activityId, storage],
  );

  // Re-seed when the activity changes (golden pattern: reset on [activity.id]).
  // Note this SEEDS rather than resets: it reads the new activity's own saved
  // work, so moving back and forth between activities never crosses their code.
  useEffect(() => {
    touchedRef.current = false;
    setSource(seedCodeSource(storage, activityId, spec.starter));
    reset();
    // `storage` is intentionally OUT of the deps. `useActivityStorage()` returns
    // a memo over the injected port, so a host that rebuilds its adapter object
    // on every render would re-seed the editor from disk mid-typing — i.e. eat
    // the learner's work — and the effect's job is "the ACTIVITY changed", not
    // "the host re-rendered".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, spec.starter, reset]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!touchedRef.current) return;
    timerRef.current = setTimeout(() => persist(code), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, persist]);

  /**
   * "Recomeçar do código inicial" — the OPPOSITE of `retry`, and the two must
   * never be collapsed into one control (Tainan, 2026-07-23): retry keeps the
   * work, this one throws it away on purpose, for the learner who broke the
   * starter so badly that they cannot get back into the class.
   *
   * The saved snapshot is dropped too. Keeping it would make the next reload
   * hand back exactly what they just chose to discard, and would leave the
   * professor's stage projecting a draft the learner has abandoned.
   */
  const resetToStarter = useCallback(() => {
    if (outOfLives) return;
    touchedRef.current = false;
    const starter = spec.starter ?? '';
    // BEFORE the clear, and the order is the whole point: a host's `clear` may
    // notify its own listeners SYNCHRONOUSLY (the Itera Player's dispatches
    // `CODE_SNAPSHOT_EVENT`, and whoever hears it re-reads the buffer).
    // Publishing afterwards would leave the mirror showing the draft the learner
    // just threw away, with no second event coming to correct it.
    liveBuffer.publish(activityId, starter, false);
    storage.clear(codeDraftKey(activityId));
    setSource({ code: starter, hasWork: false });
    reset();
  }, [activityId, spec.starter, reset, storage, liveBuffer, outOfLives]);

  /**
   * A vida sai quando o VEREDITO chega, não quando o botão é clicado.
   *
   * Aqui a correção é assíncrona — roda dentro do iframe do preview — então
   * debitar no clique cobraria de um envio que ainda pode voltar verde. O ref é
   * o que garante UM débito por envio: o efeito re-roda quando o host recria
   * qualquer dependência, e sem ele o mesmo erro custaria todas as vidas de uma
   * vez. Ele volta a zero quando a tela volta a aceitar edição, que é a
   * definição de "próxima tentativa".
   */
  const chargedRef = useRef(false);
  useEffect(() => {
    if (phase === 'editing' || phase === 'submitting') {
      chargedRef.current = false;
      return;
    }
    if (phase !== 'submitted' || results === null || allPassed || timedOut) return;
    if (chargedRef.current) return;
    chargedRef.current = true;
    attempts.spend();
  }, [phase, results, allPassed, timedOut, attempts]);

  /** Envio bloqueado no orçamento zerado, e não só escondido no componente. */
  const submit = useCallback(() => {
    if (outOfLives) return;
    runChecks();
  }, [outOfLives, runChecks]);

  /**
   * "Tentar de novo" / "Editar de novo" — de volta à edição SEM tocar no código
   * do aluno. Explicitamente NÃO é um reset: re-semear do `spec.starter` jogaria
   * fora o trabalho que ele acabou de fazer, que é o oposto de tentar de novo.
   * Largar o veredito é o que torna reabrir seguro — e sem vidas não há o que
   * reabrir.
   */
  const retry = useCallback(() => {
    if (outOfLives) return;
    reset();
  }, [outOfLives, reset]);

  /**
   * Passou tudo ⇒ a tentativa é reportada NA HORA, sem um segundo clique
   * (Tainan, 2026-08-17: *"tirar esse segundo botão continuar, o primeiro botão
   * enviar é o suficiente"*). O botão só fazia sentido enquanto ele carregava
   * uma escolha; no acerto não há escolha nenhuma.
   *
   * `settle()` move a fase para `settled`, então o efeito não roda de novo nem
   * quando o host recria `onComplete` a cada render — é isso que impede o
   * double-report, e não uma flag à parte.
   */
  useEffect(() => {
    if (phase !== 'submitted' || !allPassed) return;
    settle();
    onComplete(true, { response: code });
  }, [phase, allPassed, settle, onComplete, code]);

  /**
   * Report the REAL outcome upward, WITH the source the learner settled on.
   * With checks the verdict is "did every check pass"; without checks it stays
   * the old unconditional `true` (an ungraded snack has nothing to be wrong
   * about). This is what turns `itera.class_answers.correct` — today always
   * `true` for code — into real data for the post-class report and the podium.
   *
   * WHY THE SOURCE RIDES UP HERE: `code` used to report a bare boolean and the
   * learner's work existed in exactly ONE place, the host's local draft store
   * (`localStorage`, via the Player's `codeSnapshot.service`). Measured on
   * 2026-08-03, of 556 attempt rows only 29 (5%) carry any `response`, and NOT
   * ONE is a code attempt — the kind where *"how did they get there"* is the
   * entire question. A cleared cache, a different browser, a borrowed
   * Chromebook, and the work is gone with no record that it ever existed.
   *
   * 🔑 THE DRAFT STAYS LOCAL. This does NOT move autosave to the server: the
   * debounced snapshot keeps writing through the `storage` port exactly as
   * before (localStorage, in any host that does not redirect it), so a refresh
   * mid-exercise still restores from the machine and nothing about the
   * editing loop changes. What leaves is the SETTLED submission only — the same
   * moment, and the same channel (`ActivityCompleteDetail.response`), that
   * `single_choice`, `order`, `match` and `document` have used since PR #193.
   *
   * ⚠️ AND IT IS NOT A WRITE. Handing the source up persists nothing on its own:
   * only the learner-facing players call the persistence path, which is the
   * boundary that keeps `ActivityTestHarness` from turning a curator's typing
   * into learner data. What the players then do with it:
   *   · `activity_results.feedback.response`, capped at `MAX_RESPONSE_CHARS`
   *     (2000) and marked when truncated — the instructor-facing attempt log;
   *   · an `itera.artifacts` row, because `KIND_ARTIFACT_DEFAULTS.code` is
   *     already `persist: true` and says in its own comment *"not yet WIRED …
   *     the default is correct in advance so that wiring it later is one call
   *     site, not another policy decision"*. This is that call site.
   *
   * Both destinations are RLS'd to the learner (`results_rw_self`,
   * `artifacts_rw_self`) with the pre-existing admin/instructor read policies —
   * no new table, no new policy, no new grant.
   */
  const complete = useCallback(() => {
    if (!hasChecks) {
      onComplete(true, { response: code });
      return;
    }
    if (results === null) return;
    settle();
    onComplete(allPassed, { response: code });
  }, [hasChecks, results, allPassed, settle, onComplete, code]);

  return {
    code,
    setCode,
    phase,
    results,
    allPassed,
    hasChecks,
    /** Sem vidas: o veredito na tela é o final desta atividade. */
    outOfLives,
    attemptsSpent: attempts.spent,
    attemptsRemaining: attempts.remaining,
    /** The source is frozen while a verdict is on screen. */
    readOnly: hasChecks && (phase !== 'editing' || outOfLives),
    checksRequest,
    submit,
    receiveResults,
    retry,
    resetToStarter,
    complete,
  };
}
