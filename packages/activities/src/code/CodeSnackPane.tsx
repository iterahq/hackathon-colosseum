import { motion } from 'framer-motion';
import { Code2, ExternalLink, Loader2 } from 'lucide-react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useActivityI18n } from '../context.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';
import { DoneButton } from '../components/parts.js';
import { RichText } from '../components/RichText.js';
import { CodeEditorSurface } from './CodeEditorSurface.js';
import { useCodeSnack } from './useCodeSnack.js';
import { CodeLivePreview } from './CodeLivePreview.js';
import { CodeChecksFeedback } from './CodeChecksFeedback.js';
import { CodeResetControl } from './CodeResetControl.js';

/**
 * The split-pane snack surface: the editor (seeded from the learner's saved
 * work, falling back to `spec.starter`) + optional help link and the
 * "recomeçar" escape hatch on the LEFT, a live preview on the RIGHT. Thin view
 * over `useCodeSnack` (source + autosave/restore + the graded lifecycle).
 *
 * "The editor" is whatever the host injected through
 * `<ActivityProvider codeEditor={…}>` — Monaco in the Itera Player, a plain
 * textarea for a consumer that injected nothing. See `./CodeEditorSurface.tsx`
 * for why the package refuses to own that choice.
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
}: {
  activity: PortableActivity;
  spec: CodeSpec;
  /**
   * Widened to the shared `detail` channel so the learner's SOURCE can ride up
   * with the verdict — see `useCodeSnack.complete`. Pass-through only: this
   * component neither builds nor inspects the detail.
   */
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
}) {
  const { t } = useActivityI18n();
  const {
    code,
    setCode,
    phase,
    results,
    allPassed,
    hasChecks,
    readOnly,
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
      <RichText text={spec.prompt ?? ''} />

      <div
        className="mt-3 flex items-center gap-2 rounded-xl border border-menta/30 bg-menta/10 px-3.5 py-2.5 text-sm text-muted-foreground"
        data-testid="code-snack-hint"
      >
        <Code2 className="w-4 h-4 shrink-0 text-menta" /> {t('activity.codeSnackHint')}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          {/* The marker (the Player's `utils/stageCursorDom`) is what the
              live-class layer finds to mirror this learner's pointer to the
              class while they are on stage. A DATA ATTRIBUTE, not a prop, and
              that is exactly why it could travel into the package: the activity
              tree's public contract carries no live-session concerns, and an
              attribute costs a consumer that has no live class precisely
              nothing. The pane is geometrically identical to its twin in
              <LiveStage> — `src/test/LiveStageCursor.test.tsx` pins the three
              classes both panes share — which is what makes normalized
              coordinates honest. */}
          <div
            data-stage-cursor-source
            className="h-[360px] overflow-hidden rounded-2xl border border-border bg-[#0a0a0a]"
          >
            {/* ⚠️ `language` is HARDCODED, and `spec.language` is ignored. That
                is a defect this extraction surfaced rather than introduced —
                the seam's prop interface made the unread field visible — and it
                is deliberately NOT fixed here: `CodeSpecSchema` defaults
                `language` to `"tsx"`, which is not a Monaco language id, so
                forwarding it would silently unstyle every authored snack. Step 5
                may not change behaviour; the fix needs an audit of the authored
                content first. See CONTRACT.md finding 7. */}
            <CodeEditorSurface
              value={code}
              onChange={setCode}
              language="typescript"
              readOnly={readOnly}
            />
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
              so a reset cannot land between the submit and its verdicts. It
              stays available ON the feedback screen on purpose: that is exactly
              where the learner who broke everything asks to start over. */}
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
          onRetry={retry}
          onContinue={complete}
        />
      )}
    </motion.div>
  );
}
