import { useCallback, useMemo, useState } from 'react';
import {
  collectNeeds,
  currentTerminalStep,
  initialTerminalModel,
  isTerminalSuccess,
  normalizeCommandLine,
  resetSandbox,
  runCommand,
  unmatchedCommandCount,
  type Locale,
  type TerminalModel,
  type TerminalScenario,
} from '@iterahq/activity-spec/runtime';
import type { ActivityActionRecorder, ScenarioAction } from '../../internal/actionRecorder.js';
import { terminalSuccessMarks } from '../../internal/terminalSuccessMarks.js';

/** Which input surface produced a command — kept in the trace, see `command_run`. */
export type CommandSource = 'typed' | 'option' | 'tokens';

/**
 * The input a one-behaviour terminal KIND pins (plan
 * `20260924-activity-type-one-behavior-rule`, T11). `terminal_pick_command`
 * pins `options` + `command`, `terminal_build_command` pins `options` +
 * `token`, `terminal_type_command` pins `freeText`. The kind decides; the spec
 * cannot switch it per step. Absent for the transition kind `terminal_sandbox`,
 * which keeps reading `inputMode` and `optionGranularity` off the spec.
 */
export interface TerminalPinnedInput {
  inputMode: 'freeText' | 'options';
  granularity?: 'command' | 'token';
}

/**
 * Owns the terminal's local `TerminalModel` and derives everything the view
 * needs. Deliberately the same shape as `useSandboxScenario`: all the judging
 * belongs to `@iterahq/activity-spec/runtime`, and this hook only wires the
 * pure reducers to React state and goes inert once `readOnly`.
 *
 * It does NOT use `answerMachine`, and that is ADR-7 rather than an oversight.
 * `answerMachine` models *one answer, one submit, one verdict* over five
 * booleans; a terminal is N turns against a world model with progression
 * derived from predicates. The sibling `chat_sandbox` does not use it
 * either, for the same reason. What the repo rule actually forbids — derived
 * correction logic inline in the component — still holds: none of it is here,
 * it is in the package's `runtime/`.
 */
export function useTerminalSandbox(
  scenario: TerminalScenario,
  locale: Locale,
  reveal: boolean,
  isDone: boolean,
  recorder: ActivityActionRecorder<ScenarioAction>,
  pinned?: TerminalPinnedInput,
) {
  const [model, setModel] = useState<TerminalModel>(() => initialTerminalModel(scenario));
  /** The line being TYPED. Only the free-text surface uses it. */
  const [draft, setDraft] = useState('');
  /**
   * The chips moved UP into the prompt, in the order they were moved (plan §5).
   *
   * Stored as INDICES into the step's `tokens`, not as strings: a palette may
   * legitimately offer the same token twice (`git`, `git`) and the two chips
   * have to be independently movable. Strings would make them the same chip.
   *
   * Scoped to the step id so a palette change cannot leave stale indices
   * behind. That is why it is one state object and not two — deriving
   * "do these picks belong to the step I am rendering?" beats an effect that
   * clears them one render late.
   */
  const [picked, setPicked] = useState<{ stepId: string | null; indices: number[] }>({
    stepId: null,
    indices: [],
  });

  const won = isTerminalSuccess(scenario, model);
  // An activity finished earlier re-opens settled — recap up, nothing left to
  // operate — not as a first step nobody has started.
  const done = won || reveal || isDone;
  const readOnly = done;

  const currentStep = currentTerminalStep(scenario, model);
  const stepIdx = currentStep ? scenario.steps.indexOf(currentStep) : scenario.steps.length;
  const needs = useMemo(
    () => (currentStep ? collectNeeds(currentStep.unlock) : null),
    [currentStep],
  );

  const inputMode = pinned?.inputMode ?? scenario.inputMode ?? 'freeText';
  const expose = currentStep?.expose;
  // A step that offers whole commands sends on tap; a step that offers tokens
  // makes the learner assemble the line and press Run. Authorable PER STEP, so
  // one scenario can ramp from recognition to production (question tsq2 → C).
  const granularity = pinned?.granularity ?? expose?.optionGranularity ?? 'command';
  const optionCommands = useMemo(() => expose?.commands ?? [], [expose]);
  const optionTokens = useMemo(() => expose?.tokens ?? [], [expose]);

  /**
   * The token surface is a TRANSFER between two trays, not a text field (§5).
   * `assembling` is what tells the rest of the hook which of the two composition
   * models is live — typing, or moving chips.
   */
  const assembling = inputMode === 'options' && granularity === 'token';
  const stepId = currentStep?.id ?? null;
  const pickedIdx = useMemo(
    () => (picked.stepId === stepId ? picked.indices : []),
    [picked, stepId],
  );

  /** The chips currently UP in the prompt, in the order the learner moved them. */
  const pickedTokens = useMemo(
    () => pickedIdx.map((i) => ({ index: i, token: optionTokens[i] ?? '' })),
    [pickedIdx, optionTokens],
  );
  /** The chips still DOWN in the palette. The two sides sum to the authored list. */
  const availableTokens = useMemo(
    () =>
      optionTokens
        .map((token, index) => ({ index, token }))
        .filter(({ index }) => !pickedIdx.includes(index)),
    [optionTokens, pickedIdx],
  );

  /** What Run would actually execute: the typed line, or the assembled chips. */
  const line = assembling ? pickedTokens.map((p) => p.token).join(' ') : draft;

  const canRun = !readOnly && line.trim().length > 0;
  const canClear = !readOnly && (assembling ? pickedIdx.length > 0 : draft.length > 0);
  const canRestart = !readOnly && model.commands.length > 0;

  const run = useCallback(
    (raw: string, source: CommandSource) => {
      if (readOnly) return;
      const line = raw.trim();
      if (!line) return;
      setModel((prev) => {
        const next = runCommand(scenario, prev, line, locale);
        const ran = next.commands[next.commands.length - 1];
        // ⚠️ NORMALIZED only. The raw line the learner typed never leaves the
        // browser — see the carve-out note in `activityFamilies.ts`.
        recorder.record('command_run', {
          step_id: currentStep?.id ?? null,
          command: ran?.normalized ?? normalizeCommandLine(line),
          matched: (ran?.unlocked.length ?? 0) > 0,
          unlocked: ran?.unlocked ?? [],
          source,
        });
        return next;
      });
      setDraft('');
      setPicked({ stepId: null, indices: [] });
    },
    [readOnly, scenario, locale, recorder, currentStep],
  );

  /**
   * Which transcript lines end a step-completing command (plan §2). Derived,
   * never stored — see `terminalSuccessMarks` for why a remembered set would
   * drift after a restart.
   */
  const successLines = useMemo(() => terminalSuccessMarks(model), [model]);

  return {
    model,
    successLines,
    draft,
    won,
    done,
    readOnly,
    currentStep,
    stepIdx,
    needs,
    inputMode,
    granularity,
    assembling,
    optionCommands,
    optionTokens,
    pickedTokens,
    availableTokens,
    /** The line Run would execute — typed text, or the chips joined. */
    line,
    canRun,
    canClear,
    canRestart,
    // ⚠️ NO `ps1` HERE. It is chrome, and its fallback has to be localizable —
    // so it is resolved in the shell, which is the layer that holds the
    // dictionary. See `TerminalSandboxShell` for the whole story, including
    // what still cannot be translated and why.
    revealLines: scenario.reveal.masterLine ?? [],
    /** Commands that unlocked nothing — surfaced for the instructor (Q5 → C). */
    unmatched: unmatchedCommandCount(model),

    setDraft: (value: string) => {
      if (!readOnly) setDraft(value);
    },
    /**
     * Move a chip UP: out of the palette, into the prompt. Idempotent on an
     * index already up, so a double-fire cannot duplicate it.
     */
    pickToken: (index: number) => {
      if (readOnly) return;
      setPicked((prev) => {
        const current = prev.stepId === stepId ? prev.indices : [];
        if (current.includes(index)) return { stepId, indices: current };
        return { stepId, indices: [...current, index] };
      });
    },
    /** Move a chip back DOWN: out of the prompt, into the palette. */
    unpickToken: (index: number) => {
      if (readOnly) return;
      setPicked((prev) => {
        const current = prev.stepId === stepId ? prev.indices : [];
        return { stepId, indices: current.filter((i) => i !== index) };
      });
    },
    clearDraft: () => {
      if (readOnly) return;
      setDraft('');
      setPicked({ stepId, indices: [] });
    },
    /** Free-text Enter / the Run button / a token line. */
    runDraft: (source: CommandSource) => run(line, source),
    /** One-tap whole-command option. */
    runCommandOption: (cmd: string) => run(cmd, 'option'),
    restart: () => {
      if (readOnly) return;
      setModel((prev) => {
        const next = resetSandbox(scenario, prev);
        recorder.record('sandbox_reset', {
          step_id: currentStep?.id ?? null,
          resets: next.resets,
        });
        return next;
      });
      setDraft('');
      setPicked({ stepId: null, indices: [] });
    },
  };
}
