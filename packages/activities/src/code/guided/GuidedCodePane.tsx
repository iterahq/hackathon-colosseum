import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, PanelsTopLeft } from 'lucide-react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { useActivityI18n } from '../../context.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';
import { RichText } from '../../components/RichText.js';
import { TACTILE_CTA } from '../../components/tactile.js';
import { useHostOwnsSettledAction } from '../../components/settledAction.js';
import { useSealedAnswer } from '../../components/hostLessonRules.js';
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
  reveal = false,
}: {
  activity: PortableActivity;
  spec: CodeSpec;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  /** The host put the gabarito on screen. See `UseGuidedCodeOptions.reveal`. */
  reveal?: boolean;
}) {
  const { t } = useActivityI18n();
  const blanks = spec.blanks ?? [];
  const variant = guidedVariant(blanks);
  const sealed = useSealedAnswer(activity);
  const guided = useGuidedCode(activity.id, spec, { onComplete, reveal, sealed });
  const isDone = activity.status === 'done';
  const hostOwnsSettled = useHostOwnsSettledAction();
  // O veredito do ALUNO sai da tela enquanto o gabarito está nela: verde de
  // "você acertou" em cima de uma resposta que o professor colocou é a única
  // leitura que esta tela não pode permitir.
  const showFeedback = !guided.revealed && guided.phase !== 'editing';

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
      className="rounded-3xl border border-border bg-card p-4 md:p-6 short:p-4"
      data-testid="activity-shell"
      data-activity-kind={activity.kind}
      data-guided-variant={variant}
      data-phase={guided.phase}
      data-revealed={guided.revealed ? 'true' : 'false'}
      data-out-of-lives={guided.outOfLives ? 'true' : 'false'}
    >
      <RichText text={spec.prompt ?? ''} />

      {/* A tarja troca de texto, não acumula: "toque numa palavra" em cima de um
          template que já está travado manda o aluno tentar o que não dá. */}
      {guided.revealed ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-xl border border-streak/40 bg-streak/10 px-3.5 py-2.5 text-sm text-streak short:py-1"
          data-testid="guided-code-revealed"
        >
          <Eye className="h-4 w-4 shrink-0" /> {t('code.guided.revealedNotice')}
        </div>
      ) : guided.outOfLives ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-xl border border-clay/40 bg-clay/10 px-3.5 py-2.5 text-sm text-clay short:py-1"
          data-testid="guided-code-answer-shown"
        >
          <Eye className="h-4 w-4 shrink-0" /> {t('code.lives.answerShown')}
        </div>
      ) : (
        <div
          className="mt-3 flex items-center gap-2 rounded-xl border border-menta/30 bg-menta/10 px-3.5 py-2.5 text-sm text-muted-foreground short:py-1"
          data-testid="guided-code-hint"
        >
          <PanelsTopLeft className="h-4 w-4 shrink-0 text-menta" /> {t(GUIDED_VARIANT_HINT[variant])}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 short:mt-3">
        <GuidedCodeWorkspace
          variant={variant}
          lines={guided.lines}
          values={guided.values}
          activeBlankId={activeBlankId}
          // Sem vidas o template mostra o GABARITO, então marcar lacuna por
          // lacuna pintaria de vermelho uma resposta certa que o aluno não
          // escreveu. O veredito dele continua embaixo, no painel de feedback.
          byBlank={showFeedback && !guided.showsAnswer ? guided.grade.byBlank : null}
          revealed={guided.showsAnswer}
          wordBank={guided.wordBank}
          spentChips={guided.spentChips}
          hasTarget={activeBlankId !== null}
          help={spec.help}
          disabled={guided.readOnly || isDone}
          resetDisabled={
            isDone || guided.showsAnswer || guided.phase === 'settled'
          }
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
          hideReset={hostOwnsSettled && isDone}
        />

        <GuidedCodePreview source={guided.source} language={spec.language} ready={guided.filled} />
      </div>

      {sealed?.unreachable && !showFeedback && (
        <p role="alert" className="mt-4 text-sm text-destructive" data-testid="judge-unreachable">
          {t('activity.judgeUnreachable')}
        </p>
      )}

      {!showFeedback && !guided.showsAnswer && !(hostOwnsSettled && isDone) && (
        <button
          type="button"
          onClick={guided.submit}
          disabled={isDone || guided.outOfLives || (sealed?.judging ?? false)}
          aria-busy={sealed?.judging || undefined}
          data-testid="guided-submit"
          className={`mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 short:mt-4 ${TACTILE_CTA}`}
        >
          {sealed?.judging ? t('activity.checking') : t('activity.submit')}
        </button>
      )}

      {showFeedback && (
        <GuidedCodeFeedback
          blanks={blanks}
          grade={guided.grade}
          settled={guided.phase === 'settled'}
          attemptsSpent={guided.attemptsSpent}
          outOfLives={guided.outOfLives}
          onRetry={guided.retry}
          onContinue={guided.complete}
        />
      )}
    </motion.div>
  );
}
