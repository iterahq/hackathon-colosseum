import { motion } from 'framer-motion';
import { Code2, ExternalLink, Loader2 } from 'lucide-react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { useCodeSnack } from '@/hooks/useCodeSnack';
import { DoneButton } from '@/components/branded/activity/parts';
import { CodeLivePreview } from './CodeLivePreview';
import { CodeChecksFeedback } from './CodeChecksFeedback';
import { CodeResetControl } from './CodeResetControl';

/**
 * The split-pane snack surface: Monaco (seeded from the learner's saved work,
 * falling back to `spec.starter`) + optional help link and the "recomeçar"
 * escape hatch on the LEFT, a live preview on the RIGHT. Thin view over
 * `useCodeSnack` (source + autosave/restore + the graded lifecycle).
 *
 * Two shapes, decided by whether the spec ships `checks`:
 *   • NO checks  → exactly what it was: edit, preview, "Marcar como concluída".
 *   • WITH checks → the same editing screen (no permanent checklist anywhere)
 *     plus an "Enviar" action; the verdicts appear ONLY after a submit, and
 *     "Tentar de novo" walks back to editing with the learner's code intact.
 */
export function CodeSnackPane({
  activity,
  spec,
  onComplete,
  live = false,
}: {
  activity: Activity;
  spec: CodeSpec;
  onComplete: (correct: boolean) => void;
  live?: boolean;
}) {
  const { t } = useI18n();
  const {
    code,
    setCode,
    phase,
    results,
    allPassed,
    hasChecks,
    checksRequest,
    submit,
    receiveResults,
    retry,
    resetToStarter,
    complete,
  } = useCodeSnack(activity.id, spec, { onComplete });
  const isDone = activity.status === 'done';
  // The feedback survives into `settled` on purpose: in the LIVE class the
  // learner does not self-advance, so after reporting the result they stay on
  // this screen — hiding the verdicts there would leave them staring at a dead
  // disabled button.
  const showFeedback = hasChecks && results !== null && phase !== 'editing' && phase !== 'submitting';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-4 md:p-6"
      data-testid="activity-shell"
      data-activity-kind="code"
      data-phase={phase}
    >
      <h2 className="font-display text-foreground">{spec.prompt}</h2>

      <div
        className="mt-3 flex items-center gap-2 rounded-xl border border-menta/30 bg-menta/10 px-3.5 py-2.5 text-sm font-medium text-foreground"
        data-testid="code-snack-hint"
      >
        <Code2 className="w-4 h-4 shrink-0 text-menta" /> {t('activity.codeSnackHint')}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <div className="h-[360px] overflow-hidden rounded-2xl border border-border bg-[#0a0a0a]">
            <CodeEditor value={code} onChange={setCode} language="typescript" />
          </div>
          {spec.help && (
            <a
              href={spec.help.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="code-help-link"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-evergreen-hi hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {spec.help.label}
            </a>
          )}
          {/* Spent once the activity is settled/done, and held back mid-grading
              so a reset cannot land between the submit and its verdicts. */}
          <CodeResetControl
            onReset={resetToStarter}
            disabled={isDone || phase === 'submitting' || phase === 'settled'}
            className="mt-2"
          />
        </div>

        <div className="h-[360px] overflow-hidden rounded-2xl border border-border">
          <CodeLivePreview
            code={code}
            checksRequest={hasChecks ? checksRequest : null}
            onChecksResult={receiveResults}
          />
        </div>
      </div>

      {!hasChecks && <DoneButton done={isDone} onClick={complete} />}

      {hasChecks && !showFeedback && (
        <button
          type="button"
          onClick={submit}
          disabled={phase !== 'editing' || isDone}
          data-testid="code-submit"
          className="mt-6 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full font-medium bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {phase === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
          {phase === 'submitting' ? t('code.checks.running') : t('activity.submit')}
        </button>
      )}

      {showFeedback && (
        <CodeChecksFeedback
          checks={spec.checks ?? []}
          results={results}
          allPassed={allPassed}
          settled={phase === 'settled'}
          live={live}
          onRetry={retry}
          onContinue={complete}
        />
      )}
    </motion.div>
  );
}
