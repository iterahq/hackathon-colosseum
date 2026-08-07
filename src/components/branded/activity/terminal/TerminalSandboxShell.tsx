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
import { useEffect, useRef } from 'react';
import { RotateCcw, TerminalSquare } from 'lucide-react';
import { t, type TerminalScenario } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import { useActionRecorder } from '@/hooks/useActionRecorder';
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { ActivityShell } from '../parts';
import { RichSpans } from '../RichSpans';
import { parseInline } from '@/utils/richText';
import { SandboxHint } from '../sandbox/SandboxHint';
import { SandboxReveal } from '../sandbox/SandboxReveal';
import { SandboxWindow } from '../sandbox/SandboxWindow';
import { TerminalOptionPalette } from './TerminalOptionPalette';
import { TerminalPromptBar } from './TerminalPromptBar';
import { TerminalTranscript } from './TerminalTranscript';
import { useTerminalSandbox } from './useTerminalSandbox';

export type TerminalVariant = 'freeText' | 'options';

export function TerminalSandboxShell({
  activity,
  onComplete,
  variant,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  variant: TerminalVariant;
  /** Reveal the settled state (timer stopped/expired) even without a submission. */
  reveal?: boolean;
}) {
  const { t: tr, locale } = useI18n();
  const scenario = activity.spec as unknown as TerminalScenario;
  const isDone = activity.status === 'done';
  const trace = useActionRecorder('scenario', activity.id);
  const s = useTerminalSandbox(scenario, locale, reveal, isDone, trace);

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

  const stepLabel = s.currentStep
    ? `${tr('activity.step')} ${s.stepIdx + 1}/${scenario.steps.length}`
    : undefined;
  const coachPrompt = s.currentStep ? t(s.currentStep.prompt, locale) : undefined;
  const coachHint = s.currentStep?.hint ? t(s.currentStep.hint, locale) : undefined;

  return (
    <ActivityShell
      kind="sandbox_scenario"
      icon={TerminalSquare}
      label={tr('activity.sandboxScenario')}
    >
      <div className="flex flex-col gap-4" data-sandbox-kind="terminal" data-input-mode={variant}>
        {/* TOP ZONE — the instruction lives outside/above the window. */}
        {showControls && (stepLabel || coachPrompt) && (
          <div className="flex flex-col gap-2" data-testid="sandbox-instruction">
            {stepLabel && (
              <div className="font-mono text-[11px] uppercase tracking-wider text-menta">
                {stepLabel}
              </div>
            )}
            {coachPrompt && (
              <p className="text-[15px] font-medium text-foreground">
                <RichSpans spans={parseInline(coachPrompt)} />
              </p>
            )}
            {coachHint && (
              <SandboxHint
                hint={coachHint}
                label={t({ pt: 'ver dica', en: 'see hint' }, locale)}
              />
            )}
          </div>
        )}

        {/* MIDDLE ZONE — the window: transcript AND prompt inside it. */}
        <SandboxWindow title={scenario.initialState.windowTitle ?? 'bash — sandbox'}>
          <TerminalTranscript
            lines={s.model.lines}
            ps1={s.ps1}
            emptyHint={t(
              variant === 'options'
                ? { pt: '# monte um comando nas opções abaixo', en: '# build a command from the options below' }
                : { pt: '# digite um comando e aperte Enter', en: '# type a command and press Enter' },
              locale,
            )}
          />
          {showControls && (
            <TerminalPromptBar
              ps1={s.ps1}
              value={s.draft}
              editable={variant === 'freeText'}
              placeholder={t(
                variant === 'options'
                  ? { pt: 'escolha abaixo…', en: 'pick below…' }
                  : { pt: 'digite um comando…', en: 'type a command…' },
                locale,
              )}
              canRun={s.canRun}
              onChange={s.setDraft}
              onRun={() => s.runDraft(variant === 'options' ? 'tokens' : 'typed')}
              runLabel={t({ pt: 'Rodar', en: 'Run' }, locale)}
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
                tokens={s.optionTokens}
                disabled={s.readOnly}
                onPickCommand={s.runCommandOption}
                onPickToken={s.appendToken}
                label={t(
                  s.granularity === 'command'
                    ? { pt: 'Escolha o comando', en: 'Pick the command' }
                    : { pt: 'Monte o comando', en: 'Build the command' },
                  locale,
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
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-evergreen/50 hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t({ pt: 'Recomeçar', en: 'Restart' }, locale)}
              </button>
              {s.canClear && variant === 'options' && (
                <button
                  type="button"
                  onClick={s.clearDraft}
                  data-testid="terminal-clear"
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-evergreen/50 hover:text-foreground"
                >
                  {t({ pt: 'Limpar', en: 'Clear' }, locale)}
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
