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
import type { ActionRecorder } from '@/hooks/useActionRecorder';
import { terminalSuccessMarks } from '@/utils/terminalSuccessMarks';

/** Which input surface produced a command — kept in the trace, see `command_run`. */
export type CommandSource = 'typed' | 'option' | 'tokens';

/**
 * Owns the terminal's local `TerminalModel` and derives everything the view
 * needs. Deliberately the same shape as `useSandboxScenario`: all the judging
 * belongs to `@iterahq/activity-spec/runtime`, and this hook only wires the
 * pure reducers to React state and goes inert once `readOnly`.
 *
 * It does NOT use `answerMachine`, and that is ADR-7 rather than an oversight.
 * `answerMachine` models *one answer, one submit, one verdict* over five
 * booleans; a terminal is N turns against a world model with progression
 * derived from predicates. The sibling `sandbox_scenario` chat does not use it
 * either, for the same reason. What the repo rule actually forbids — derived
 * correction logic inline in the component — still holds: none of it is here,
 * it is in the package's `runtime/`.
 */
export function useTerminalSandbox(
  scenario: TerminalScenario,
  locale: Locale,
  reveal: boolean,
  isDone: boolean,
  recorder: ActionRecorder<'scenario'>,
) {
  const [model, setModel] = useState<TerminalModel>(() => initialTerminalModel(scenario));
  /** The line being composed — free-text typing, or tokens tapped together. */
  const [draft, setDraft] = useState('');

  const won = isTerminalSuccess(scenario, model);
  const done = won || reveal;
  const readOnly = done || isDone;

  const currentStep = currentTerminalStep(scenario, model);
  const stepIdx = currentStep ? scenario.steps.indexOf(currentStep) : scenario.steps.length;
  const needs = useMemo(
    () => (currentStep ? collectNeeds(currentStep.unlock) : null),
    [currentStep],
  );

  const inputMode = scenario.inputMode ?? 'freeText';
  const expose = currentStep?.expose;
  // A step that offers whole commands sends on tap; a step that offers tokens
  // makes the learner assemble the line and press Run. Authorable PER STEP, so
  // one scenario can ramp from recognition to production (question tsq2 → C).
  const granularity = expose?.optionGranularity ?? 'command';
  const optionCommands = useMemo(() => expose?.commands ?? [], [expose]);
  const optionTokens = useMemo(() => expose?.tokens ?? [], [expose]);

  const canRun = !readOnly && draft.trim().length > 0;
  const canClear = !readOnly && draft.length > 0;
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
    optionCommands,
    optionTokens,
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
    /** Tap a token: append it to the line. The palette is NOT consumed. */
    appendToken: (token: string) => {
      if (readOnly) return;
      setDraft((prev) => (prev.trim() ? `${prev.trim()} ${token}` : token));
    },
    clearDraft: () => {
      if (!readOnly) setDraft('');
    },
    /** Free-text Enter / the Run button / a token line. */
    runDraft: (source: CommandSource) => run(draft, source),
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
    },
  };
}
