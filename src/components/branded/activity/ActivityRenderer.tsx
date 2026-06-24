/**
 * Activity renderer — dispatches an itera.activities row to the right view by
 * `kind`. Implemented now: document, diagram, quiz. Code is a consistent
 * placeholder (judge0 lands later). Canonical labels throughout.
 *
 * Presentation lives inside the LessonPlayer's FOCUSED, centered chrome (the
 * full-width progress bar + X + hearts live in LessonPlayer). The QUIZ is the
 * hero: it renders inline (a green-mono "TRUE OR FALSE?"-style label derived
 * from the quiz spec, the bold question, and the options as side-by-side
 * buttons for a 2-option quiz / a stacked list otherwise) — NO card shell. The
 * other kinds keep their rounded card but inherit the same centered layout.
 *
 * `spec` shapes (from the seed data):
 *   document: { prompt: string, body?: string }
 *   diagram:  { prompt: string, mermaid?: string, imageUrl?: string }
 *   quiz:     { prompt: string, question?: string, label?: string,
 *              options: [{ id|label, text|label, isCorrect }], explanation? }
 *   code:     { language?: string, starter?: string, prompt?: string }
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, GitBranch, Code2, CheckCircle2, XCircle, Construction } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';

export function ActivityRenderer({
  activity,
  onComplete,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
}) {
  switch (activity.kind) {
    case 'document':
      return <DocumentActivity activity={activity} onComplete={onComplete} />;
    case 'diagram':
      return <DiagramActivity activity={activity} onComplete={onComplete} />;
    case 'quiz':
      return <QuizActivity activity={activity} onComplete={onComplete} />;
    case 'code':
      return <CodePlaceholder activity={activity} onComplete={onComplete} />;
    default:
      return <UnknownActivity activity={activity} />;
  }
}

function KindBadge({ icon: Icon, label, qa = false }: { icon: LucideIcon; label: string; qa?: boolean }) {
  // Brand: Q&A label = clay + JB Mono uppercase (clay is RESERVED for Q&A).
  // Every other activity kind uses the evergreen eyebrow.
  const cls = qa
    ? 'bg-clay/15 text-clay border-clay/30'
    : 'bg-evergreen-soft text-evergreen-hi border-evergreen/30';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider border ${cls}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

function Shell({
  kind,
  icon,
  label,
  qa = false,
  children,
}: {
  kind: string;
  icon: LucideIcon;
  label: string;
  qa?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-6 md:p-8"
      data-testid="activity-shell"
      data-activity-kind={kind}
    >
      <KindBadge icon={icon} label={label} qa={qa} />
      <div className="mt-5">{children}</div>
    </motion.div>
  );
}

function DocumentActivity({ activity, onComplete }: { activity: Activity; onComplete: (c: boolean) => void }) {
  const { t } = useI18n();
  const spec = activity.spec as { prompt?: string; body?: string };
  const isDone = activity.status === 'done';
  return (
    <Shell kind="document" icon={FileText} label={t('activity.document')}>
      <h2 className="font-display text-foreground">{spec.prompt ?? t('activity.document')}</h2>
      {spec.body && (
        <div className="prose prose-invert max-w-none mt-4 text-muted-foreground whitespace-pre-wrap">
          {spec.body}
        </div>
      )}
      <DoneButton done={isDone} onClick={() => onComplete(true)} />
    </Shell>
  );
}

function DiagramActivity({ activity, onComplete }: { activity: Activity; onComplete: (c: boolean) => void }) {
  const { t } = useI18n();
  const spec = activity.spec as { prompt?: string; mermaid?: string; imageUrl?: string };
  const isDone = activity.status === 'done';
  return (
    <Shell kind="diagram" icon={GitBranch} label={t('activity.diagram')}>
      <h2 className="font-display text-foreground">{spec.prompt ?? t('activity.diagram')}</h2>
      <div className="mt-4 rounded-2xl border border-border bg-obsidiana/60 p-4 grid-pattern">
        {spec.imageUrl ? (
          <img src={spec.imageUrl} alt={spec.prompt ?? 'diagram'} className="mx-auto rounded-xl" />
        ) : spec.mermaid ? (
          <pre className="font-mono text-xs text-menta overflow-x-auto whitespace-pre">{spec.mermaid}</pre>
        ) : (
          <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
            <GitBranch className="w-6 h-6 text-menta" />
            <span className="text-sm">{spec.prompt}</span>
          </div>
        )}
      </div>
      <DoneButton done={isDone} onClick={() => onComplete(true)} />
    </Shell>
  );
}

type QuizOption = { id?: string; label?: string; text?: string; isCorrect?: boolean };

/**
 * QUIZ — the hero activity. Renders inline (no card shell) inside the focused
 * column: a green-mono uppercase label, the bold question, then the options.
 * A 2-option quiz renders as side-by-side buttons (the True/False target); a
 * quiz with more options falls back to a responsive grid/stacked list.
 */
function QuizActivity({ activity, onComplete }: { activity: Activity; onComplete: (c: boolean) => void }) {
  const { t } = useI18n();
  const spec = activity.spec as {
    prompt?: string;
    question?: string;
    label?: string;
    options?: QuizOption[];
    explanation?: string;
  };
  const options = useMemo(() => spec.options ?? [], [spec.options]);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const correctIdx = options.findIndex((o) => o.isCorrect);
  const isCorrect = submitted && selected === correctIdx;

  // Small green-mono label above the question. Prefer the spec's own label;
  // a 2-option quiz defaults to the canonical "TRUE OR FALSE?" eyebrow.
  const eyebrow =
    spec.label ?? (options.length === 2 ? t('quiz.trueOrFalse') : t('activity.quizPrompt'));
  const question = spec.question ?? spec.prompt ?? t('activity.quizPrompt');
  const sideBySide = options.length === 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="activity-quiz"
      data-activity-kind="quiz"
    >
      {/* Question card — subtle border, slightly-lighter dark bg. */}
      <div className="rounded-3xl border border-border bg-card p-6 md:p-7">
        <div className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi" data-testid="quiz-eyebrow">
          {eyebrow}
        </div>
        <h2 className="font-display font-bold text-xl md:text-2xl text-foreground mt-2" data-testid="quiz-question">
          {question}
        </h2>
      </div>

      {/* Options */}
      <div
        className={`mt-5 ${sideBySide ? 'grid grid-cols-2 gap-4' : 'space-y-2.5'}`}
        data-testid="quiz-options"
      >
        {options.map((o, i) => {
          const label = o.text ?? o.label ?? String(o.id ?? i + 1);
          const chosen = selected === i;
          const showCorrect = submitted && o.isCorrect;
          const showWrong = submitted && chosen && !o.isCorrect;
          return (
            <button
              key={i}
              disabled={submitted}
              onClick={() => setSelected(i)}
              data-testid="quiz-option"
              className={`rounded-2xl border px-5 transition-colors ${
                sideBySide
                  ? 'h-16 flex items-center justify-center text-center font-display font-bold text-lg'
                  : 'w-full flex items-center gap-3 py-4 text-left'
              } ${
                showCorrect
                  ? 'border-verde-tech bg-verde-tech/10'
                  : showWrong
                    ? 'border-destructive bg-destructive/10'
                    : chosen
                      ? 'border-menta bg-menta/10'
                      : 'border-border bg-card hover:border-verde-tech/50'
              }`}
            >
              <span className={sideBySide ? '' : 'flex-1'}>{label}</span>
              {!sideBySide && showCorrect && <CheckCircle2 className="w-5 h-5 text-menta" />}
              {!sideBySide && showWrong && <XCircle className="w-5 h-5 text-destructive" />}
            </button>
          );
        })}
        {options.length === 0 && <p className="text-sm text-muted-foreground">{spec.prompt}</p>}
      </div>

      {submitted && spec.explanation && (
        <p className="mt-4 text-sm text-muted-foreground rounded-xl bg-card border border-border p-4">
          {spec.explanation}
        </p>
      )}

      {!submitted ? (
        <button
          disabled={selected === null}
          onClick={() => setSubmitted(true)}
          className="mt-6 h-11 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="quiz-submit"
        >
          {t('activity.submit')}
        </button>
      ) : (
        <DoneButton done={activity.status === 'done'} onClick={() => onComplete(isCorrect)} />
      )}
    </motion.div>
  );
}

function CodePlaceholder({ activity, onComplete }: { activity: Activity; onComplete: (c: boolean) => void }) {
  const { t } = useI18n();
  const spec = activity.spec as { language?: string; starter?: string; prompt?: string };
  return (
    <Shell kind="code" icon={Code2} label={t('activity.code')}>
      <h2 className="font-display text-foreground">{spec.prompt ?? t('activity.code')}</h2>
      <div className="mt-4 rounded-2xl border border-border bg-[#0d0c0a] overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-9 border-b border-border bg-obsidiana/60">
          {/* Flat brand: editor chrome dots use neutral muted (clay is reserved for Q&A). */}
          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-evergreen/60" />
          <span className="ml-2 text-xs text-muted-foreground font-mono">{spec.language ?? 'code'}</span>
        </div>
        <pre className="p-4 font-mono text-sm text-menta overflow-x-auto whitespace-pre">
          {spec.starter ?? '// ...'}
        </pre>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Construction className="w-4 h-4" /> {t('activity.codeSoon')}
      </div>
      <DoneButton done={activity.status === 'done'} onClick={() => onComplete(true)} />
    </Shell>
  );
}

function UnknownActivity({ activity }: { activity: Activity }) {
  return (
    <div
      className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
      data-activity-kind="unknown"
    >
      Unsupported activity kind: {activity.kind}
    </div>
  );
}

function DoneButton({ done, onClick }: { done?: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      className="mt-6 inline-flex items-center gap-2 h-11 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
      data-testid="activity-done"
    >
      <CheckCircle2 className="w-4 h-4" />
      {done ? t('activity.done') : t('activity.markDone')}
    </button>
  );
}
