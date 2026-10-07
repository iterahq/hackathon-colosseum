/**
 * Shared scaffold for the two terminal sandbox types (free text / options).
 *
 * Deliberately the SAME structure as `SandboxScenarioShell`: it owns the local
 * model via `useTerminalSandbox`, renders the identical instruction → window →
 * bottom-zone layout, and the only thing the two types vary is what sits in the
 * bottom zone. Reuses the chat sandbox's `SandboxWindow`, `SandboxHint` and
 * `SandboxReveal` outright rather than growing a parallel set.
 *
 * LAYOUT — the "Cloud Cowork" 3-zone law (plan
 * `20260717-iterahq-activities-visual-ux-redesign`, whose target image is
 * literally the DFL-Labs git sandbox): instruction ABOVE the window → the
 * OS-style window with the transcript AND the prompt INSIDE it at 100% width →
 * the options palette / restart OUTWARD below. Step count is DATA-DRIVEN off
 * `scenario.steps.length`, never capped (question Q1 → A: N steps, one command
 * or one ordered array per step, and no evaluation step — a terminal already
 * has an objective right and wrong, so paying for a judge would be paying twice).
 */
import { useEffect, useMemo, useRef } from 'react';
import { RotateCcw, TerminalSquare } from 'lucide-react';
import { t, type TerminalScenario } from '@iterahq/activity-spec/runtime';
import { useActivityI18n } from '../../context.js';
import { useActivityActionRecorder, type ScenarioAction } from '../../internal/actionRecorder.js';
import { ActivityShell } from '../../components/parts.js';
import { SandboxStepHeader } from '../../components/SandboxStepHeader.js';
import { SandboxReveal } from '../sandbox/SandboxReveal.js';
import { SandboxWindow } from '../sandbox/SandboxWindow.js';
import { TerminalOptionPalette } from './TerminalOptionPalette.js';
import { TerminalPromptBar } from './TerminalPromptBar.js';
import { TerminalTranscript } from './TerminalTranscript.js';
import { useTerminalSandbox } from './useTerminalSandbox.js';
import { useTerminalScreenMirror } from './useTerminalScreenMirror.js';
import { TERMINAL_BODY } from './terminalGeometry.js';
import type { ActivityTerminalScreen } from '../../ports.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';

export type TerminalVariant = 'freeText' | 'options';

/**
 * HOW A TURN IS SUBMITTED — plan `20260807-itera-terminal-sandbox-refinamentos`
 * §4. Three input surfaces, three different answers to "what sends this?", and
 * the affordance has to match or it teaches the wrong thing:
 *
 *   `enter`    free text — type it, then Enter or the Run button.
 *   `tap`      whole-command options — ONE TAP SENDS. No Run button at all.
 *   `assemble` token chips — build the line, then Run. The button is required.
 *
 * `tap` used to render the Run button too, permanently disabled next to a line
 * that could never hold anything: a control that does nothing is not neutral —
 * it tells the learner that a second action is expected, and they wait for it.
 *
 * It is derived, not authored: `variant` (the activity's `inputMode`) plus the
 * CURRENT step's `optionGranularity`, which is per-step by design (tsq2 → C), so
 * one scenario legitimately ramps `tap` → `assemble` → and the affordance
 * changes under the learner mid-activity. That is the intended difficulty ramp,
 * not a glitch.
 */
export type TerminalSubmitMode = 'enter' | 'tap' | 'assemble';

const PLACEHOLDER_KEY: Record<TerminalSubmitMode, string> = {
  enter: 'terminal.placeholder.freeText',
  tap: 'terminal.placeholder.tap',
  assemble: 'terminal.placeholder.assemble',
};

export function TerminalSandboxShell({
  activity,
  onComplete,
  variant,
  granularity,
  pinned = false,
  reveal = false,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  variant: TerminalVariant;
  /**
   * Set ONLY by a one-behaviour kind (`terminal_pick_command` → `command`,
   * `terminal_build_command` → `token`). With it, the kind pins the input and
   * the spec's `inputMode` / per-step `optionGranularity` cannot switch it.
   * `terminal_type_command` pins through `pinned` with no granularity.
   */
  granularity?: 'command' | 'token';
  /** Pin `variant` as the input mode (the one-behaviour kinds). */
  pinned?: boolean;
  /** Reveal the settled state (timer stopped/expired) even without a submission. */
  reveal?: boolean;
}) {
  const { t: tr, locale } = useActivityI18n();
  const scenario = activity.spec as unknown as TerminalScenario;
  const isDone = activity.status === 'done';
  const trace = useActivityActionRecorder<ScenarioAction>(activity.id);
  const s = useTerminalSandbox(
    scenario,
    locale,
    reveal,
    isDone,
    trace,
    pinned || granularity ? { inputMode: variant, granularity } : undefined,
  );

  const showControls = !s.done;

  // THE VERDICT IS THE SCENARIO'S OWN CRITERION, NOT A CONSTANT — the same rule
  // the chat shell arrived at (and the same bug it had until 2026-07-31, when a
  // hard-coded `onComplete(true, …)` made the force-reveal path assert a pass
  // nobody earned). `s.won` is `isTerminalSuccess(scenario, model)`, i.e. the
  // spec's own `success` predicate; `reveal` alone settles the activity but
  // does NOT pass it.
  //
  // Question Q5 → A: a learner who ran five wrong commands and then the right
  // one settles as `true`. This is practice, not an exam. The wrong attempts are
  // not discarded — they are counted, handed up in the trace as `command_run`
  // rows with `matched: false` (Q5 → C), because a step that accumulates far
  // more misses than its siblings is evidence about the MATCHER, not the class.
  const recap = t(scenario.reveal.recap, locale);
  const verdict = s.won || isDone;
  const settled = s.won || reveal || isDone;
  const emittedRef = useRef(false);
  useEffect(() => {
    if (settled && !emittedRef.current) {
      emittedRef.current = true;
      onComplete(verdict, { explanation: recap, actions: trace.drain() });
    }
  }, [settled, verdict, recap, onComplete, trace]);

  /**
   * ── i18n OF THE TERMINAL (plan §3) — WHAT IS FIXED AND WHAT IS NOT ─────────
   *
   * FIXED HERE: every string this component owns now comes from the app
   * dictionary (`terminal.*` in `src/i18n`), in both locales. They used to be
   * `{ pt, en }` object literals inlined in the JSX — translated, but invisible
   * to anyone auditing what the activity says, and unreviewable without opening
   * the component. `src/test/terminalI18n.test.ts` keeps them from coming back.
   *
   * STILL NOT FIXED, and it is NOT fixable in this repo: the strings the AUTHOR
   * writes inside the spec — `initialState.ps1`, `windowTitle`, `welcome`,
   * `cannedOutput[*].lines`, `unknownCommand.lines`. Those are typed
   * `z.string()` by `@iterahq/activity-spec`, and the spec is Zod-validated at
   * the render boundary (`SandboxScenarioGuard`), so authoring `{ pt, en }`
   * there today renders the invalid-spec card. Widening those five fields to
   * `z.union([z.string(), I18nSchema])` is a change in the PACKAGE repo, plus a
   * republish and a version bump here.
   *
   * The two `t(…)` calls below are already tolerant of that widening — `t`
   * accepts `I18n | string` — so the day the package ships it, this file needs
   * no edit. What is NOT tolerant is `welcome` / `cannedOutput`, because those
   * are resolved inside `initialTerminalModel` / `runCommand`, in the package.
   *
   * ✅ Engine output IS bilingual already: engines emit structured events and a
   * `ResponseTable` of `{ pt, en }` templates renders them, so "nothing staged
   * to commit" and its Portuguese twin come from the same code path.
   */
  const ps1 = t(scenario.initialState.ps1 ?? tr('terminal.ps1'), locale);

  const submitMode: TerminalSubmitMode =
    variant === 'freeText' ? 'enter' : s.granularity === 'command' ? 'tap' : 'assemble';

  const coachPrompt = s.currentStep ? t(s.currentStep.prompt, locale) : undefined;
  const coachHint = s.currentStep?.hint ? t(s.currentStep.hint, locale) : undefined;
  const windowTitle = t(scenario.initialState.windowTitle ?? tr('terminal.windowTitle'), locale);

  /**
   * WHAT A MIRROR GETS — the drawn screen, not the model. See
   * `ActivityTerminalScreen` for why those are different objects, and
   * `useTerminalScreenMirror` for the defect that made this necessary.
   *
   * Memoised because the publish effect keeps it in its deps: a fresh object per
   * render would re-publish on every keystroke of the draft line, and the host's
   * mirror re-broadcasts on publish.
   */
  const screen = useMemo<ActivityTerminalScreen>(
    () => ({
      lines: s.model.lines,
      ps1,
      windowTitle,
      successLines: [...s.successLines],
      stepIdx: s.stepIdx,
      stepCount: scenario.steps.length,
      stepPrompt: coachPrompt ?? null,
      won: s.won,
      commandCount: s.model.commands.length,
    }),
    [s.model, s.successLines, s.stepIdx, s.won, ps1, windowTitle, coachPrompt, scenario.steps.length],
  );
  // A terminal showing only its authored welcome banner is ON SCREEN but is not
  // WORK — the same distinction `hasWork` draws for the code snack, and the one
  // that keeps an idle learner from being announced as "em andamento".
  useTerminalScreenMirror(activity.id, screen, s.model.commands.length > 0);

  // Mesmo motivo do shell de chat: o `data-activity-kind` é o da ROW. O
  // `data-sandbox-kind="terminal"` abaixo continua fixo de propósito — ele
  // descreve a TELA, e é o que os testes de terminal já usam.
  return (
    <ActivityShell
      kind={activity.kind}
      icon={TerminalSquare}
      label={tr('activity.sandboxScenario')}
    >
      <div
        className="flex flex-col gap-4"
        data-sandbox-kind="terminal"
        data-input-mode={variant}
        data-submit-mode={submitMode}
      >
        {/* TOP ZONE — the instruction lives outside/above the window. */}
        {showControls && s.currentStep && (
          <SandboxStepHeader
            stepIdx={s.stepIdx}
            stepCount={scenario.steps.length}
            prompt={coachPrompt}
            hint={coachHint}
            hintLabel={tr('terminal.hint')}
          />
        )}

        {/* MIDDLE ZONE — the window: transcript AND prompt inside it, as a
            full-height column. Transcript first and growing, prompt LAST and
            rigid: that ordering is the layout, not decoration. See
            `TERMINAL_BODY` above. */}
        <SandboxWindow title={windowTitle} bodyClassName={TERMINAL_BODY}>
          <TerminalTranscript
            lines={s.model.lines}
            ps1={ps1}
            successLines={s.successLines}
            successLabel={tr('terminal.stepCompleted')}
            emptyHint={s.done ? '' : tr(variant === 'options' ? 'terminal.empty.options' : 'terminal.empty.freeText')}
          />
          {showControls && (
            <TerminalPromptBar
              ps1={ps1}
              value={s.line}
              editable={submitMode === 'enter'}
              /* §5: the token surface composes CHIPS, not text. The other two
                 surfaces pass `null` and keep the string rendering. */
              pills={submitMode === 'assemble' ? s.pickedTokens : null}
              onRemovePill={s.unpickToken}
              removeLabel={tr('terminal.removeChip')}
              /* THE RUN BUTTON EXISTS ONLY WHERE IT DOES SOMETHING (plan §4). */
              showRun={submitMode !== 'tap'}
              submitMode={submitMode}
              placeholder={tr(PLACEHOLDER_KEY[submitMode])}
              canRun={s.canRun}
              onChange={s.setDraft}
              onRun={() => s.runDraft(submitMode === 'assemble' ? 'tokens' : 'typed')}
              runLabel={tr('terminal.run')}
            />
          )}
        </SandboxWindow>

        {/* BOTTOM ZONE — the palette (options mode) and the restart affordance. */}
        {showControls && (
          <div className="flex flex-col gap-3" data-testid="terminal-controls">
            {variant === 'options' && (
              <TerminalOptionPalette
                granularity={s.granularity}
                commands={s.optionCommands}
                tokens={s.availableTokens}
                disabled={s.readOnly}
                onPickCommand={s.runCommandOption}
                onPickToken={s.pickToken}
                emptyLabel={tr('terminal.paletteEmpty')}
                label={tr(
                  s.granularity === 'command' ? 'terminal.pickCommand' : 'terminal.buildCommand',
                )}
              />
            )}
            <div className="flex items-center gap-2">
              {/* "Recomeçar" — resets the WORLD, keeps the trace (Q4 → A).
                  It is the UX answer to the dead end that the POC's
                  reachability BFS used to detect statically; scenarios are a
                  few steps long, so replaying them under the hood (option B)
                  would buy politeness at the price of putting the learner in a
                  state they never watched happen. */}
              <button
                type="button"
                disabled={!s.canRestart}
                onClick={s.restart}
                data-testid="terminal-restart"
                className="coarse:relative coarse:before:absolute coarse:before:-inset-y-2 coarse:before:inset-x-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-evergreen/50 hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {tr('terminal.restart')}
              </button>
              {s.canClear && variant === 'options' && (
                <button
                  type="button"
                  onClick={s.clearDraft}
                  data-testid="terminal-clear"
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-evergreen/50 hover:text-foreground"
                >
                  {tr('terminal.clear')}
                </button>
              )}
            </div>
          </div>
        )}

        {s.done && (
          <SandboxReveal recap={scenario.reveal.recap} locale={locale} lines={s.revealLines} />
        )}
      </div>
    </ActivityShell>
  );
}
