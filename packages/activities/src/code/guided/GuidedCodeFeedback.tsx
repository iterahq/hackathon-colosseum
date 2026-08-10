import { motion } from 'framer-motion';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import type { CodeBlank } from '@iterahq/activity-spec';
import { useActivityI18n } from '../../context.js';
import type { GuidedGrade } from './types.js';

/**
 * The post-submit verdict for a guided template.
 *
 * It lists only the holes that are WRONG, with their hint. The right ones are
 * already marked green in the code itself, and repeating them here would bury
 * the one line the learner has to look at. The wrong ones keep their answer
 * visible in the template too — hiding it would make "tentar de novo" start from
 * nothing after a single mistake.
 */
export function GuidedCodeFeedback({
  blanks,
  grade,
  settled = false,
  onRetry,
  onContinue,
}: {
  blanks: readonly CodeBlank[];
  grade: GuidedGrade;
  /** The result was already reported upward — the actions are spent. */
  settled?: boolean;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const { t } = useActivityI18n();
  // The POSITION travels with the blank, because the list is filtered: the third
  // hole must still read "Lacuna 3" when it is the only wrong one.
  const wrong = blanks
    .map((blank, index) => ({ blank, position: index + 1 }))
    .filter(({ blank }) => !grade.byBlank[blank.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-4 rounded-2xl border p-4 md:p-5 ${
        grade.allCorrect ? 'border-menta/40 bg-menta/10' : 'border-clay/40 bg-clay/10'
      }`}
      role="status"
      aria-live="polite"
      data-testid="guided-feedback"
      data-all-correct={grade.allCorrect ? 'true' : 'false'}
      data-settled={settled ? 'true' : undefined}
    >
      <div className="flex items-center gap-2">
        {grade.allCorrect ? (
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-menta" />
        ) : (
          <XCircle className="h-5 w-5 flex-shrink-0 text-clay" />
        )}
        <p
          className={`font-display font-semibold ${grade.allCorrect ? 'text-menta' : 'text-clay'}`}
          data-testid="guided-feedback-title"
        >
          {grade.allCorrect ? t('code.checks.allPassed') : t('code.checks.someFailed')}
        </p>
        <span
          className="ml-auto font-mono text-xs text-muted-foreground"
          data-testid="guided-score"
        >
          {t('code.checks.score', {
            passed: String(grade.correctCount),
            total: String(blanks.length),
          })}
        </span>
      </div>

      {wrong.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="guided-feedback-wrong">
          {wrong.map(({ blank, position }) => (
            <li
              key={blank.id}
              data-blank-id={blank.id}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-clay" />
              <span>
                <strong className="font-medium text-foreground">
                  {t('code.guided.blankPosition', { position: String(position) })}
                </strong>{' '}
                — {blank.hint ?? t('code.guided.wrongBlank')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          disabled={settled}
          data-testid="guided-retry"
          className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-6 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            grade.allCorrect
              ? 'border border-border text-muted-foreground hover:text-foreground'
              : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi'
          }`}
        >
          <RotateCcw className="h-4 w-4" />
          {grade.allCorrect ? t('code.checks.editAgain') : t('code.checks.retry')}
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={settled}
          data-testid="guided-continue"
          className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-6 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            grade.allCorrect
              ? 'bg-menta text-obsidiana hover:bg-evergreen-hi'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {grade.allCorrect ? t('activity.continue') : t('code.checks.continueAnyway')}
        </button>
      </div>
    </motion.div>
  );
}
