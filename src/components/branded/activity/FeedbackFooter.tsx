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
 *
 * ── THE WIDTH CONTRACT (2026-08-10) — read before you touch the row classes ──
 *
 * Tainan, TG, on a `terminal_sandbox` in the live class: *"feedback tá com
 * design quebrado (nao consome a largura disponivel)"*. The authored recap
 * wrapped into a ~110px sliver across FIFTEEN lines while the bar had the whole
 * page. `LiveWaitWithRecap` in `src/stories/FeedbackFooter.stories.tsx`
 * reproduces it exactly.
 *
 * ── The mechanism, because the fix is not obvious from the symptom ──
 *
 * The row is `md:flex-row md:justify-between` with two children: the verdict
 * block and a trailing slot (the CTA, or the wait hint). The trailing slot is
 * `flex-shrink-0`; the verdict block had no grow factor and a `flex-basis:auto`
 * of max-content. So the verdict block was the ONLY shrinkable item in the row
 * and absorbed the entire deficit by itself. The live wait hint — indicator +
 * *"Pronto! Aguarde o professor avançar. · você levou 11 segundos"* — is ~460px
 * wide and refuses to shrink; inside a 624px content box it left the verdict
 * ~110px. `justify-between` cannot help: there was no free space to distribute,
 * only a shortfall to absorb.
 *
 * ── Three classes hold the fix. Each one covers a different width range ──
 *
 *  1. **`max-w-5xl` on the content row** (was `max-w-2xl`). 672px is the PROSE
 *     measure — right for a reading column, wrong for a bar that carries two
 *     blocks SIDE BY SIDE. It was also narrower than the activity it judges:
 *     the live sandbox column is `max-w-4xl` (`LIVE_COLUMN_OVERRIDES` in
 *     `src/utils/activityColumnWidth.ts`) and the author-harness column is
 *     760px. 1024px is what leaves the verdict roughly a prose measure of its
 *     own (1024 − 48 padding − 12 gap − 460 hint ≈ 504) once the hint has taken
 *     its share. That is the anchor — not "wider looked better".
 *  2. **`min-w-0 md:flex-1` on the verdict block**, so it CLAIMS the free space
 *     instead of merely surviving the shortfall. `md:` scopes the grow factor
 *     to the row layout: below `md` the container is `flex-col`, the main axis
 *     is vertical, and a grow factor there fights the auto height.
 *  3. **`md:max-w-[50%]` on the wait-hint slot.** This is a FLOOR PROTECTOR for
 *     narrow rows, not the wide-row layout, and the number is chosen for that:
 *     at ≥1024px, 50% clears the hint's natural ~460px, so it does NOT bite and
 *     the hint stays on one clean line. Between `md` (768) and ~1000px it does
 *     bite, and the hint wraps to two right-aligned lines instead of starving
 *     the recap. Measured at 820px: recap 330px / hint 2 lines, versus 285px
 *     for the recap without the cap.
 *
 *     A tighter cap (40%) buys the recap ~60px more at desktop and costs the
 *     hint a wrap that ORPHANS its hourglass indicator on its own line — the
 *     hint's inner markup is `inline-flex flex-wrap justify-end` and lives at
 *     the call site (`LiveSessionPage`), not here. Both variants were rendered
 *     and compared; 50% is the one that fixes the complaint without creating a
 *     second, smaller one.
 *
 * The CTA keeps `flex-shrink-0` with NO cap: a button that wraps its own label
 * is a worse defect than a hint that wraps, and "Continuar" is short anyway.
 *
 * `e2e/feedback-footer-width.spec.ts` measures (1) and (2) in a real browser.
 * (3) is only observable in the live WAIT mode, which no hermetic suite can
 * reach today — that file's header says so explicitly. Do not assume it is
 * gated.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { parseInline } from '@/utils/richText';
import { RichSpans } from './RichSpans';
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
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div
              className={`flex min-w-0 items-start gap-2.5 md:flex-1 ${
                correct ? 'text-menta' : 'text-destructive'
              }`}
            >
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
                    <RichSpans spans={parseInline(result.explanation)} />
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
              <div
                className="flex-shrink-0 text-sm md:max-w-[50%] md:text-right"
                data-testid="feedback-footer-wait"
              >
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
