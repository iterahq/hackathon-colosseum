import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useActivityStorage } from '../../context.js';
import type { ActivityStoragePort } from '../../ports.js';
import { codeBlanksDraftKey, codeDraftKey } from '../draftKey.js';
import type { GuidedPhase, GuidedValues, UseGuidedCodeCallbacks } from './types.js';
import { allBlanksFilled, gradeGuided, splitGuidedTemplate, substituteBlanks } from './guidedCode.js';
import { buildWordBank, restoreGuidedValues, spentBankCounts } from './wordBank.js';

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
  { onComplete }: UseGuidedCodeCallbacks,
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

  // Derived every render on purpose: `blanks` has a fresh identity each time the
  // parent re-parses, so a `useMemo` keyed on it would recompute anyway while
  // reading as if it cached. Templates are a screenful of code, not a workload.
  const lines = splitGuidedTemplate(starter, blanks);
  const wordBank = buildWordBank(spec);
  const source = substituteBlanks(starter, blanks, values);
  const filled = allBlanksFilled(blanks, values);
  const grade = gradeGuided(blanks, values);
  const spentChips = spentBankCounts(blanks, values);

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
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!touchedRef.current) return;
    // BOTH halves are written: the substituted source under the key the open
    // editor already uses (the professor's stage reads that one and must not
    // learn about guided), the answers under their own key so the widgets can be
    // put back. See `../draftKey.ts` for why it is two keys and not one field.
    timerRef.current = setTimeout(() => {
      storageRef.current.write(codeDraftKey(activityId), source);
      storageRef.current.write(codeBlanksDraftKey(activityId), JSON.stringify(values));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activityId, source, values]);

  const submit = useCallback(() => {
    if (!filled) return;
    setPhase('submitted');
  }, [filled]);

  const retry = useCallback(() => setPhase('editing'), []);

  const resetAll = useCallback(() => {
    touchedRef.current = false;
    storageRef.current.clear(codeDraftKey(activityId));
    storageRef.current.clear(codeBlanksDraftKey(activityId));
    setValues({});
    setPhase('editing');
  }, [activityId]);

  const complete = useCallback(() => {
    if (!filled) return;
    setPhase('settled');
    onComplete(grade.allCorrect, { response: source });
  }, [filled, grade.allCorrect, onComplete, source]);

  return {
    values,
    setValue,
    lines,
    wordBank,
    spentChips,
    source,
    filled,
    grade,
    phase,
    readOnly: phase !== 'editing',
    submit,
    retry,
    resetAll,
    complete,
  };
}
