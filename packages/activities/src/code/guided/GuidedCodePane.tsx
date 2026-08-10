import { useState } from 'react';
import { motion } from 'framer-motion';
import { PanelsTopLeft } from 'lucide-react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useActivityI18n } from '../../context.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';
import { RichText } from '../../components/RichText.js';
import { guidedVariant } from './guidedCode.js';
import { useGuidedCode } from './useGuidedCode.js';
import { GuidedCodeFeedback } from './GuidedCodeFeedback.js';
import { GuidedCodePreview } from './GuidedCodePreview.js';
import { GuidedCodeWorkspace } from './GuidedCodeWorkspace.js';

/**
 * The instruction strip is per VARIANT, not per activity: what the learner has
 * to do differs enough between placing a chip, picking from a dropdown and
 * typing that one generic sentence would be wrong twice out of three times.
 */
const GUIDED_VARIANT_HINT = {
  options: 'code.guided.hint.options',
  dropdown: 'code.guided.hint.dropdown',
  text: 'code.guided.hint.text',
  mixed: 'code.guided.hint.mixed',
} as const;

/**
 * The guided code surface: a LOCKED template on the left, the live preview on the
 * right — geometrically the same split as `CodeSnackPane`, so a lesson that mixes
 * guided and open exercises does not change shape between them.
 *
 * Thin view over `useGuidedCode`; the only state it owns is which hole the next
 * chip is aimed at, which is a pointer concern and nothing the trace or the
 * verdict cares about.
 */
export function GuidedCodePane({
  activity,
  spec,
  onComplete,
}: {
  activity: PortableActivity;
  spec: CodeSpec;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
}) {
  const { t } = useActivityI18n();
  const blanks = spec.blanks ?? [];
  const variant = guidedVariant(blanks);
  const guided = useGuidedCode(activity.id, spec, { onComplete });
  const isDone = activity.status === 'done';
  const showFeedback = guided.phase !== 'editing';

  /**
   * Which hole the next chip lands in. `null` means "wherever is next": the bank
   * aims itself at the first empty hole, so the common case — read the code top
   * to bottom, place words in order — needs no aiming click at all.
   */
  const [aimed, setAimed] = useState<string | null>(null);
  const firstEmptyBank = blanks.find((b) => b.kind === 'bank' && !guided.values[b.id])?.id ?? null;
  const activeBlankId = aimed && !guided.values[aimed] ? aimed : firstEmptyBank;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-4 md:p-6"
      data-testid="activity-shell"
      data-activity-kind="code"
      data-guided-variant={variant}
      data-phase={guided.phase}
    >
      <RichText text={spec.prompt ?? ''} />

      <div
        className="mt-3 flex items-center gap-2 rounded-xl border border-menta/30 bg-menta/10 px-3.5 py-2.5 text-sm text-muted-foreground"
        data-testid="guided-code-hint"
      >
        <PanelsTopLeft className="h-4 w-4 shrink-0 text-menta" /> {t(GUIDED_VARIANT_HINT[variant])}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <GuidedCodeWorkspace
          variant={variant}
          lines={guided.lines}
          values={guided.values}
          activeBlankId={activeBlankId}
          byBlank={showFeedback ? guided.grade.byBlank : null}
          wordBank={guided.wordBank}
          spentChips={guided.spentChips}
          hasTarget={activeBlankId !== null}
          help={spec.help}
          disabled={guided.readOnly || isDone}
          resetDisabled={isDone || guided.phase === 'settled'}
          onAim={setAimed}
          onSet={(blankId, value) => {
            guided.setValue(blankId, value);
            setAimed(null);
          }}
          onPickChip={(word) => {
            if (!activeBlankId) return;
            guided.setValue(activeBlankId, word);
            setAimed(null);
          }}
          onReset={guided.resetAll}
        />

        <GuidedCodePreview source={guided.source} ready={guided.filled} />
      </div>

      {!showFeedback && (
        <button
          type="button"
          onClick={guided.submit}
          disabled={!guided.filled || isDone}
          data-testid="guided-submit"
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-evergreen px-6 font-medium text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('activity.submit')}
        </button>
      )}

      {showFeedback && (
        <GuidedCodeFeedback
          blanks={blanks}
          grade={guided.grade}
          settled={guided.phase === 'settled'}
          onRetry={guided.retry}
          onContinue={guided.complete}
        />
      )}
    </motion.div>
  );
}
