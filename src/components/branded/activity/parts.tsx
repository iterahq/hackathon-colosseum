/**
 * Shared activity presentation primitives, extracted so the v1 general
 * learning-activity components (Concept / Video / SingleChoice / MultiChoice /
 * Match / Order) share ONE branded shell + ONE done affordance with the
 * existing renderer (converge, don't fork — plan Q3). The legacy
 * `ActivityRenderer` keeps its own inline copies for zero-regression; NEW
 * components use these.
 */
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Evergreen eyebrow badge naming the activity kind. */
export function KindBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider border bg-evergreen-soft text-evergreen-hi border-evergreen/30">
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-3xl border border-border bg-card p-6 md:p-8"
      data-testid="activity-shell"
      data-activity-kind={kind}
    >
      <KindBadge icon={icon} label={label} />
      <div className="mt-5">{children}</div>
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
  const { t } = useI18n();
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
 */
export function SubmitButton({
  submitted,
  disabled = false,
  onSubmit,
  testId,
}: {
  submitted: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  testId?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={submitted ? undefined : onSubmit}
      disabled={submitted || disabled}
      data-submitted={submitted ? 'true' : undefined}
      data-testid={testId}
      className={`mt-6 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full font-medium transition-colors ${
        submitted
          ? 'bg-menta/15 text-menta border border-menta/40 cursor-default'
          : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi disabled:opacity-40 disabled:cursor-not-allowed'
      }`}
    >
      {submitted && <CheckCircle2 className="w-4 h-4" />}
      {submitted ? t('activity.sent') : t('activity.submit')}
    </button>
  );
}
