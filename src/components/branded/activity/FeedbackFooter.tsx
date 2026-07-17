/**
 * FeedbackFooter — the GLOBAL, viewport-fixed answer-feedback bar (the
 * Duolingo / OpenEnglish pattern). After the learner submits a graded activity
 * the footer slides up from the bottom edge, tinted GREEN (correct) / RED
 * (incorrect) with the DS correctness tokens, carrying the correctness message
 * (+ optional explanation) and a "Continuar" CTA that advances.
 *
 * It renders at the LESSON/SHELL level (LessonPlayer for async, LiveSessionPage
 * for the live class), NOT inside each activity component — the activity only
 * emits its graded result UP (via the shell's `onComplete(correct)` callback)
 * and the shell drives this footer. This REPLACES the old inline
 * `ResultBanner`/`Alert` strip that used to live inside the activity body: the
 * correctness signal now lives ONLY here (plus the SubmitButton's own locked
 * color, which stays).
 *
 * Two modes:
 *   • `onContinue` set (async self-paced player + author test harness) → the
 *     footer shows the "Continuar" CTA; clicking it advances.
 *   • `onContinue` omitted + `waitHint` set (live/synchronous class) → the
 *     learner does NOT advance themselves (the instructor force-advances the
 *     cohort), so instead of a CTA the footer shows the "wait for the next one"
 *     hint next to the same green/red signal.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { FooterResult } from './activityFeedbackKinds';

export function FeedbackFooter({
  result,
  onContinue,
  waitHint,
  busy = false,
  continueTestId = 'feedback-footer-continue',
}: {
  /** The settled result to surface, or `null` to keep the footer hidden. */
  result: FooterResult | null;
  /** Advance CTA handler (async player / harness). Omit for the live wait mode. */
  onContinue?: () => void;
  /** Shown in place of the CTA in the live (force-advance) mode. */
  waitHint?: ReactNode;
  /** Disables the CTA while an advance/persist is in flight. */
  busy?: boolean;
  continueTestId?: string;
}) {
  const { t } = useI18n();
  const correct = result?.correct ?? false;

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          key="feedback-footer"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className={`fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-md ${
            correct ? 'border-menta/40 bg-menta/10' : 'border-destructive/40 bg-destructive/10'
          }`}
          role="status"
          aria-live="polite"
          data-testid="feedback-footer"
          data-correct={correct ? 'true' : 'false'}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className={`flex items-start gap-2.5 ${correct ? 'text-menta' : 'text-destructive'}`}>
              {correct ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-display font-semibold leading-tight" data-testid="feedback-footer-title">
                  {result.message ?? (correct ? t('activity.correct') : t('activity.incorrect'))}
                </p>
                {result.explanation && (
                  <p className="mt-0.5 text-sm text-foreground/80" data-testid="feedback-footer-explanation">
                    {result.explanation}
                  </p>
                )}
              </div>
            </div>

            {onContinue ? (
              <button
                type="button"
                onClick={onContinue}
                disabled={busy}
                data-testid={continueTestId}
                className={`inline-flex h-11 flex-shrink-0 items-center justify-center gap-2 rounded-full px-8 font-medium transition-colors disabled:opacity-60 ${
                  correct
                    ? 'bg-menta text-obsidiana hover:bg-evergreen-hi'
                    : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                }`}
              >
                {t('activity.continue')}
              </button>
            ) : waitHint ? (
              <div className="flex-shrink-0 text-sm md:text-right" data-testid="feedback-footer-wait">
                {waitHint}
              </div>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default FeedbackFooter;
