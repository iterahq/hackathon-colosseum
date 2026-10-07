import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useActivityStorage } from '../../context.js';
import type { ActivityStoragePort } from '../../ports.js';
import { codeBlanksDraftKey, codeDraftKey } from '../draftKey.js';
import type { GuidedPhase, GuidedValues, UseGuidedCodeOptions } from './types.js';
import {
  allBlanksFilled,
  gradeGuided,
  revealedValues,
  splitGuidedTemplate,
  substituteBlanks,
} from './guidedCode.js';
import { buildWordBank, restoreGuidedValues, spentBankCounts } from './wordBank.js';
import { useCodeAttempts } from '../useCodeAttempts.js';
import { usePagehideFlush } from '../../internal/usePagehideFlush.js';

/**
 * The same debounce as the open editor's, and that is deliberate: the two
 * surfaces write to the same draft store, and drifting values would make "which
 * write wins" depend on which surface the learner happened to be on.
 */
const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * What the guided template opens with: the learner's OWN saved answers when
 * there are any, empty holes otherwise.
 *
 * Re-authoring an activity leaves a draft the current spec cannot honour, and
 * `restoreGuidedValues` is where that is filtered — by id AND by what each hole
 * still accepts. Carrying the rest forward would grade an answer to a question
 * that no longer exists.
 */
function seedValues(
  storage: ActivityStoragePort,
  activityId: string,
  spec: CodeSpec,
): GuidedValues {
  const raw = storage.read(codeBlanksDraftKey(activityId));
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  return restoreGuidedValues(spec, parsed as GuidedValues);
}

/**
 * Owns the guided variants' answers, their persistence, and the one-step
 * verdict.
 *
 * Deliberately a SIBLING of `useCodeSnack` rather than a branch inside it. The
 * two agree on the surface vocabulary (autosave, restore, "recomeçar", a source
 * riding up as `response`) but disagree on the only thing that matters to the
 * state machine: the open editor's unit of state is a string the learner types
 * and its verdict is a round trip to the preview iframe, while here the unit is
 * a map of authored answers and the verdict is local and instant. Folding both
 * into one hook would mean every caller reads two machines to understand one.
 */
export function useGuidedCode(
  activityId: string,
  spec: CodeSpec,
  { onComplete, reveal = false }: UseGuidedCodeOptions,
) {
  const storage = useActivityStorage();
  const blanks = spec.blanks ?? [];
  const starter = spec.starter ?? '';
  /**
   * The re-seed key. `spec` itself is re-created by `safeParseActivitySpec` on
   * every render of the parent, so an effect that depended on it would wipe the
   * learner's answers on each keystroke. Only VALUES are allowed in those deps.
   */
  const blankIdsKey = blanks.map((b) => b.id).join('|');
  const specRef = useRef(spec);
  specRef.current = spec;
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const [values, setValues] = useState<GuidedValues>(() =>
    seedValues(storage, activityId, specRef.current),
  );
  const [phase, setPhase] = useState<GuidedPhase>('editing');
  /**
   * Has the learner touched THIS activity's holes? Without it the debounce would
   * write the restored seed back one tick after every mount, resurrecting what a
   * reset just discarded and telling the professor "em andamento" about someone
   * who only opened the screen.
   */
  const touchedRef = useRef(false);

  /**
   * The gabarito is on screen. Only the guided variants can be in this state —
   * `blanks` empty means there is no authored answer, and the open editor is a
   * different surface entirely.
   */
  const revealed = reveal && blanks.length > 0;

  /**
   * O orçamento de envios errados. Esgotado, o gabarito SOBE À TELA, e essa é a
   * decisão desenhada e não um efeito colateral: sem saída, o aluno numa aula ao
   * vivo fica olhando um botão morto enquanto a turma anda, e o guiado é
   * exatamente a superfície onde revelar não custa nada inventar —
   * `blanks[].answer` é uma solução que o autor já escreveu (ver
   * `revealedValues`). O veredito reportado continua sendo o do ALUNO.
   */
  const attempts = useCodeAttempts(activityId);
  const outOfLives = attempts.exhausted;
  const showsAnswer = revealed || (outOfLives && blanks.length > 0);

  // Derived every render on purpose: `blanks` has a fresh identity each time the
  // parent re-parses, so a `useMemo` keyed on it would recompute anyway while
  // reading as if it cached. Templates are a screenful of code, not a workload.
  const lines = splitGuidedTemplate(starter, blanks);
  const wordBank = buildWordBank(spec);
  /**
   * TWO reads of the same holes, and keeping them apart is the point.
   *
   * `values` is the learner's work: it is what the autosave effect below writes,
   * what `gradeGuided` judges and what rides up as `response`. `shownValues` is
   * what the screen displays. Revealing swaps only the second one, so the draft
   * survives untouched and coming back out of the reveal puts the learner's own
   * answers back with no restore step — there is nothing to restore, because
   * nothing was overwritten.
   */
  const shownValues = showsAnswer ? revealedValues(blanks) : values;
  const source = substituteBlanks(starter, blanks, values);
  const shownSource = showsAnswer ? substituteBlanks(starter, blanks, shownValues) : source;
  const filled = allBlanksFilled(blanks, values);
  const grade = gradeGuided(blanks, values);
  const spentChips = spentBankCounts(blanks, shownValues);

  const setValue = useCallback((blankId: string, value: string) => {
    touchedRef.current = true;
    setValues((prev) => ({ ...prev, [blankId]: value }));
  }, []);

  useEffect(() => {
    touchedRef.current = false;
    setValues(seedValues(storageRef.current, activityId, specRef.current));
    setPhase('editing');
    // `storage` rides a ref and stays OUT of the deps for the same reason it does
    // in `useCodeSnack`: a host that rebuilds its adapter object per render would
    // otherwise re-seed from disk mid-exercise, i.e. eat the learner's answers.
  }, [activityId, blankIdsKey]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The write the debounce is still holding — flushed if the page goes away
  // inside the window, so a reload does not empty the holes just filled.
  const pendingWriteRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingWriteRef.current = null;
    if (!touchedRef.current) return;
    // BOTH halves are written: the substituted source under the key the open
    // editor already uses (the professor's stage reads that one and must not
    // learn about guided), the answers under their own key so the widgets can be
    // put back. See `../draftKey.ts` for why it is two keys and not one field.
    //
    // `revealed` is deliberately absent from this effect, guard and deps alike:
    // both `source` and `values` are read off the LEARNER, so a reveal changes
    // neither and the effect never re-runs. An early return keyed on `revealed`
    // would look safer and be worse — it would drop the debounced write of the
    // keystrokes typed in the second before the professor clicked.
    const write = () => {
      // Timer and page-hide can both reach this: the first one wins.
      if (pendingWriteRef.current !== write) return;
      pendingWriteRef.current = null;
      storageRef.current.write(codeDraftKey(activityId), source);
      storageRef.current.write(codeBlanksDraftKey(activityId), JSON.stringify(values));
    };
    pendingWriteRef.current = write;
    timerRef.current = setTimeout(write, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activityId, source, values]);
  usePagehideFlush(pendingWriteRef);

  /*
   * The three transitions refuse to run while the gabarito is up.
   *
   * The UI already hides the buttons, and that is not enough: a refusal in the
   * hook is what makes "revelar não vira acerto" unreachable rather than merely
   * unclicked. Whoever wires a new affordance later inherits the rule for free.
   */
  const submit = useCallback(() => {
    if (revealed || outOfLives) return;
    // A vida sai AQUI, no mesmo tick do veredito, e não num efeito que observe a
    // fase: o guiado corrige localmente e sem round trip, então um efeito só
    // acrescentaria uma janela em que a tela já diz "errou" e o saldo ainda não.
    if (!grade.allCorrect) attempts.spend();
    setPhase('submitted');
  }, [revealed, outOfLives, grade.allCorrect, attempts]);

  const retry = useCallback(() => {
    if (outOfLives) return;
    setPhase('editing');
  }, [outOfLives]);

  const resetAll = useCallback(() => {
    if (revealed || outOfLives) return;
    touchedRef.current = false;
    storageRef.current.clear(codeDraftKey(activityId));
    storageRef.current.clear(codeBlanksDraftKey(activityId));
    setValues({});
    setPhase('editing');
  }, [activityId, revealed, outOfLives]);

  const complete = useCallback(() => {
    if (revealed) return;
    setPhase('settled');
    onComplete(grade.allCorrect, { response: source });
  }, [revealed, grade.allCorrect, onComplete, source]);

  return {
    values: shownValues,
    setValue,
    lines,
    wordBank,
    spentChips,
    source: shownSource,
    // Revelado, o preview roda o gabarito: as lacunas estão todas "cheias" na
    // tela, e segurar o resultado justamente na hora de mostrar a resposta
    // esconderia a metade que responde "e daí?".
    filled: showsAnswer || filled,
    grade,
    phase,
    revealed,
    /** Sem vidas: o veredito do aluno é final e o gabarito está na tela. */
    outOfLives,
    /** As lacunas mostram a resposta autorada — por reveal do professor OU por fim das vidas. */
    showsAnswer,
    attemptsSpent: attempts.spent,
    attemptsRemaining: attempts.remaining,
    readOnly: showsAnswer || phase !== 'editing',
    submit,
    retry,
    resetAll,
    complete,
  };
}
