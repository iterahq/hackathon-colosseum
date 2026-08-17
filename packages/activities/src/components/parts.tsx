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

export { AnswerExplanation } from './AnswerExplanation.js';

/** Evergreen eyebrow badge naming the activity kind. */
export function KindBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider border bg-evergreen-soft text-evergreen-hi border-evergreen/30">
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

/** The rounded branded card shell every non-hero activity kind lives inside. */
export function ActivityShell({
  kind,
  icon,
  label,
  children,
}: {
  kind: string;
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  const compact = COMPACT_KINDS.has(kind);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full rounded-3xl border border-border bg-card px-6 md:px-8 ${
        compact ? 'py-4 md:py-5' : 'py-6 md:py-8'
      }`}
      data-testid="activity-shell"
      data-activity-kind={kind}
    >
      <KindBadge icon={icon} label={label} />
      <div className={compact ? 'mt-3' : 'mt-5'}>{children}</div>
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
  const locked = Boolean(done);
  return (
    <button
      onClick={onClick}
      disabled={disabled || locked}
      data-locked={locked ? 'true' : undefined}
      className={`mt-6 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full font-medium transition-colors ${
        locked
          ? 'bg-menta/15 text-menta border border-menta/40 cursor-default'
          : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi disabled:opacity-40 disabled:cursor-not-allowed'
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
 * when right, red when wrong — the Duolingo "feedback lives in the action"
 * law. The LABEL stays "Enviado" either way (existing test contract); only the
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
      className={`mt-6 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full font-medium transition-colors ${
        incorrect
          ? 'bg-destructive/15 text-destructive border border-destructive/40 cursor-default'
          : submitted
            ? 'bg-menta/15 text-menta border border-menta/40 cursor-default'
            : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi disabled:opacity-40 disabled:cursor-not-allowed'
      }`}
    >
      {submitted && (incorrect ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />)}
      {submitted ? t('activity.sent') : t('activity.submit')}
    </button>
  );
}
