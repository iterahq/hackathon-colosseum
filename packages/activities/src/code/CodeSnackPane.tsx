import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Code2, Loader2 } from 'lucide-react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useActivityI18n } from '../context.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';
import { DoneButton } from '../components/parts.js';
import { RichText } from '../components/RichText.js';
import { CodeEditorSurface } from './CodeEditorSurface.js';
import { parseEditableRegions } from './editableRegions.js';
import { CODE_PANE_BOX, CODE_SPLIT_EDITOR, CODE_SPLIT_GRID, CODE_SPLIT_PREVIEW } from './geometry.js';
import { CodeHelpLink } from './CodeHelpLink.js';
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
    outOfLives,
    attemptsSpent,
    readOnly,
    checksRequest,
    submit,
    receiveResults,
    retry,
    resetToStarter,
    complete,
  } = useCodeSnack(activity.id, spec, { onComplete });
  const isDone = activity.status === 'done';
  // A phone shows one pane at a time: stacked, the pair pushed the button a
  // screen away. The hidden pane keeps its box (`invisible`, not `hidden`), so
  // the preview frame the checks run in never collapses to 0x0.
  const [phonePane, setPhonePane] = useState<'code' | 'preview'>('code');
  // Recomputed from the CURRENT source, never from the starter: the learner's
  // own saved draft and every edit they make move the marker lines around, and
  // a region pinned to the starter's line numbers would drift onto locked code
  // after the first newline. See `./editableRegions.ts`.
  const editableRegions = useMemo(() => parseEditableRegions(code), [code]);
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
      data-activity-kind={activity.kind}
      data-phase={phase}
      data-out-of-lives={outOfLives ? 'true' : 'false'}
    >
      <RichText text={spec.prompt ?? ''} />

      <div
        className="mt-3 flex items-center gap-2 rounded-xl border border-menta/30 bg-menta/10 px-3.5 py-2.5 text-sm text-muted-foreground max-sm:hidden"
        data-testid="code-snack-hint"
      >
        <Code2 className="w-4 h-4 shrink-0 text-menta" /> {t('activity.codeSnackHint')}
      </div>

      <div
        role="group"
        aria-label={t('code.pane.label')}
        className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1 sm:hidden"
        data-testid="code-pane-switch"
      >
        {(['code', 'preview'] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            aria-pressed={phonePane === pane}
            onClick={() => setPhonePane(pane)}
            data-testid={`code-pane-${pane}`}
            className={`h-11 rounded-lg text-sm font-medium transition-colors ${
              phonePane === pane ? 'bg-evergreen-soft text-evergreen-hi' : 'text-muted-foreground'
            }`}
          >
            {t(pane === 'code' ? 'code.pane.code' : 'code.pane.preview')}
          </button>
        ))}
      </div>

      <div className={`mt-4 max-sm:mt-3 ${CODE_SPLIT_GRID}`}>
        <div
          className={`flex flex-col max-sm:[grid-area:1/1] ${CODE_SPLIT_EDITOR} ${
            phonePane === 'code' ? '' : 'max-sm:invisible'
          }`}
        >
          {/* The marker (the Player's `utils/stageCursorDom`) is what the
              live-class layer finds to mirror this learner's pointer to the
              class while they are on stage. A DATA ATTRIBUTE, not a prop, and
              that is exactly why it could travel into the package: the activity
              tree's public contract carries no live-session concerns, and an
              attribute costs a consumer that has no live class precisely
              nothing. The SHAPE comes from `./geometry.ts`, shared with the twin
              pane in <LiveStage> — `src/test/LiveStageCursor.test.tsx` pins both
              against those tokens — which is what makes normalized coordinates
              honest; the remaining size difference is handled on the wire. */}
          <div
            data-stage-cursor-source
            // `relative` é a outra metade do contrato: o host desenha o ponteiro
            // do professor DENTRO deste painel por portal, posicionado em % dele.
            className={`relative ${CODE_PANE_BOX} border border-border bg-[#0a0a0a]`}
          >
            {/* `spec.language` now drives the editor: `"html"` and `"css"` (the
                plain-web course) get Monaco's own mode, everything else — including
                the schema default `"tsx"`, which is not itself a Monaco
                language id — keeps `"typescript"`, exactly as before this kind
                had a second language. See CONTRACT.md finding 7 for the
                history of why this used to be hardcoded. */}
            <CodeEditorSurface
              value={code}
              onChange={setCode}
              language={spec.language === 'html' || spec.language === 'css' ? spec.language : 'typescript'}
              readOnly={readOnly}
              editableRegions={editableRegions}
            />
          </div>
          <CodeHelpLink help={spec.help} />
          {/* Spent once the activity is settled/done, and held back mid-grading
              so a reset cannot land between the submit and its verdicts. It
              stays available ON the feedback screen on purpose: that is exactly
              where the learner who broke everything asks to start over. */}
          <CodeResetControl
            onReset={resetToStarter}
            disabled={isDone || outOfLives || phase === 'submitting' || phase === 'settled'}
            className="mt-2"
          />
        </div>

        <div
          className={`max-sm:[grid-area:1/1] ${CODE_SPLIT_PREVIEW} ${CODE_PANE_BOX} border border-border ${
            phonePane === 'preview' ? '' : 'max-sm:invisible'
          }`}
        >
          <CodeLivePreview
            code={code}
            language={spec.language}
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
          disabled={phase !== 'editing' || isDone || outOfLives}
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
          attemptsSpent={attemptsSpent}
          outOfLives={outOfLives}
          onRetry={retry}
          onContinue={complete}
        />
      )}
    </motion.div>
  );
}
