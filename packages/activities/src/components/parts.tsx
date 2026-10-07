/**
 * Shared activity presentation primitives, extracted so the v1 general
 * learning-activity components (Concept / Video / SingleChoice / MultiChoice /
 * Match / Order) share ONE branded shell + ONE done affordance with the
 * existing renderer (converge, don't fork — plan Q3). The legacy
 * `ActivityRenderer` keeps its own inline copies for zero-regression; NEW
 * components use these.
 */
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { transitionKindOf } from '../oneBehaviourKinds.js';
import { useHostOwnsSettledAction } from './settledAction.js';
import { TACTILE_CTA, TACTILE_CTA_MISSED, TACTILE_CTA_SETTLED } from './tactile.js';
import { TeraPeek, TeraPeekRoom, useTeraMentioned } from './teraPresence.js';

export { AnswerExplanation, answerExplanationText } from './AnswerExplanation.js';

/** Evergreen eyebrow badge naming the activity kind. */
export function KindBadge({ icon: Icon, label, className = '' }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider border bg-evergreen-soft text-evergreen-hi border-evergreen/30 ${className}`}
      data-testid="kind-badge"
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

/**
 * The sandbox kinds get tighter padding: their content is a chat window or a
 * terminal, which already carries its own frame.
 *
 * Both are listed because the split of the old single sandbox kind into
 * `chat_sandbox` + `terminal_sandbox` would otherwise have loosened the padding
 * on every migrated row — a layout regression with no failing test to catch it,
 * since `data-activity-kind` and the spacing were reading the same literal.
 */
const COMPACT_KINDS = new Set(['chat_sandbox', 'terminal_sandbox']);
// The one-behaviour chat and terminal kinds are the same windows (T10, T11).
const isCompactKind = (kind: string) => COMPACT_KINDS.has(transitionKindOf(kind));

/**
 * The rounded branded card shell every non-hero activity kind lives inside.
 * When the activity talks about Tera he peeks over the top-right corner —
 * unless the kind draws him itself (`mascot="none"`, the scene guide).
 *
 * The kind badge is read by screen readers only, on every screen: the learner
 * does not need the exercise type named, and every band above the exercise
 * pushes its answer below the fold. On a phone, and on a screen 800 px high or
 * less (`short:`), the padding is tighter too. A card Tera peeks over floats a
 * spacer the size of his face in the top-right corner of the content: the first
 * lines wrap around him instead of running under him, and no row is spent.
 */
export function ActivityShell({
  kind,
  icon,
  label,
  mascot = 'auto',
  children,
}: {
  kind: string;
  icon: LucideIcon;
  label: string;
  mascot?: 'auto' | 'none';
  children: React.ReactNode;
}) {
  const compact = isCompactKind(kind);
  const tera = useTeraMentioned() && mascot === 'auto';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative w-full rounded-3xl border border-border bg-card px-6 max-sm:px-4 md:px-8 ${
        compact ? 'py-4 max-sm:py-3' : 'py-5 max-sm:py-4'
      }`}
      data-testid="activity-shell"
      data-activity-kind={kind}
      data-tera={tera ? 'true' : undefined}
    >
      {tera && <TeraPeek />}
      <KindBadge icon={icon} label={label} className="sr-only" />
      <div>
        {tera && <TeraPeekRoom />}
        {children}
      </div>
    </motion.div>
  );
}

/**
 * The completion button. Once `done`, it LOCKS into a positive menta "concluída"
 * state (matches the legacy renderer's DoneButton semantics so live-mode advance
 * behaves identically across the whole activity system).
 */
export function DoneButton({
  done,
  onClick,
  disabled = false,
}: {
  done?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t } = useActivityI18n();
  const hostOwns = useHostOwnsSettledAction();
  const locked = Boolean(done);
  if (hostOwns && locked) return null;
  return (
    <button
      onClick={onClick}
      disabled={disabled || locked}
      data-locked={locked ? 'true' : undefined}
      className={`mt-6 max-sm:mt-4 short:mt-4 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full ${
        locked ? TACTILE_CTA_SETTLED : TACTILE_CTA
      }`}
      data-testid="activity-done"
    >
      <CheckCircle2 className="w-4 h-4" />
      {locked ? t('activity.done') : t('activity.markDone')}
    </button>
  );
}

/**
 * The ONE-STEP submit affordance for graded kinds (single/multi choice, match,
 * order, quiz). Clicking "Enviar" both grades the answer (revealing the
 * green/red result) AND fires the completion side-effect in the SAME action —
 * there is NO separate "Marcar como concluída" step. Once `submitted`, the
 * button LOCKS into a disabled positive "Enviado" state (mirrors DoneButton's
 * locked look). Pre-submit it is disabled until the learner has a valid answer.
 *
 * `correct` (optional): when the caller KNOWS the grading result of THIS
 * submission (i.e. `submitted` just flipped true in this session — never pass
 * it for a merely-`isDone`/reveal render where the learner's actual answer
 * isn't known), the locked state also carries the correctness signal — green
 * when right, dashed and quiet when wrong (never red inside an activity). The LABEL stays "Enviado" either way (existing test contract); only the
 * color/icon change. Omit `correct` to keep the old neutral "Enviado" look.
 *
 * NOTE: the correctness MESSAGE no longer lives inline next to this button.
 * The old `ResultBanner` strip was removed — the correct/incorrect message now
 * surfaces ONLY in the global viewport-fixed `FeedbackFooter` (rendered at the
 * lesson/shell level). This button keeps just its own locked color as a belt-&
 * -braces cue.
 */
export function SubmitButton({
  submitted,
  correct,
  disabled = false,
  onSubmit,
  testId,
}: {
  submitted: boolean;
  correct?: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  testId?: string;
}) {
  const { t } = useActivityI18n();
  const hostOwns = useHostOwnsSettledAction();
  if (hostOwns && submitted) return null;
  const graded = submitted && correct !== undefined;
  const incorrect = graded && correct === false;
  return (
    <button
      type="button"
      onClick={submitted ? undefined : onSubmit}
      disabled={submitted || disabled}
      data-submitted={submitted ? 'true' : undefined}
      data-correct={graded ? String(correct) : undefined}
      data-testid={testId}
      className={`mt-6 max-sm:mt-4 short:mt-4 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full ${
        incorrect ? TACTILE_CTA_MISSED : submitted ? TACTILE_CTA_SETTLED : TACTILE_CTA
      }`}
    >
      {submitted && (incorrect ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />)}
      {submitted ? t('activity.sent') : t('activity.submit')}
    </button>
  );
}
