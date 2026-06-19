/**
 * Activity renderer — dispatches an itera.activities row to the right view by
 * `kind`. Implemented now: document, diagram, quiz. Code is a consistent
 * placeholder (judge0 lands later). Canonical labels throughout.
 *
 * `spec` shapes (from the seed data):
 *   document: { prompt: string, body?: string }
 *   diagram:  { prompt: string, mermaid?: string, imageUrl?: string }
 *   quiz:     { prompt: string, question?: string, options: [{ id|label, text|label, isCorrect }], explanation? }
 *   code:     { language?: string, starter?: string, prompt?: string }
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, GitBranch, HelpCircle, Code2, CheckCircle2, XCircle, Construction } from 'lucide-react';
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
  icon,
  label,
  qa = false,
  children,
}: {
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
    <Shell icon={FileText} label={t('activity.document')}>
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
    <Shell icon={GitBranch} label={t('activity.diagram')}>
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

function QuizActivity({ activity, onComplete }: { activity: Activity; onComplete: (c: boolean) => void }) {
  const { t } = useI18n();
  const spec = activity.spec as { prompt?: string; question?: string; options?: QuizOption[]; explanation?: string };
  const options = useMemo(() => spec.options ?? [], [spec.options]);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const correctIdx = options.findIndex((o) => o.isCorrect);
  const isCorrect = submitted && selected === correctIdx;

  return (
    <Shell icon={HelpCircle} label={t('activity.quiz')} qa>
      <h2 className="font-display text-foreground">
        {spec.question ?? spec.prompt ?? t('activity.quizPrompt')}
      </h2>
      <div className="mt-4 space-y-2.5" data-testid="quiz-options">
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
              className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-colors ${
                showCorrect
                  ? 'border-verde-tech bg-verde-tech/10'
                  : showWrong
                    ? 'border-destructive bg-destructive/10'
                    : chosen
                      ? 'border-menta bg-menta/10'
                      : 'border-border bg-obsidiana/40 hover:border-verde-tech/50'
              }`}
            >
              <span className="flex-1">{label}</span>
              {showCorrect && <CheckCircle2 className="w-5 h-5 text-menta" />}
              {showWrong && <XCircle className="w-5 h-5 text-destructive" />}
            </button>
          );
        })}
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">{spec.prompt}</p>
        )}
      </div>

      {submitted && spec.explanation && (
        <p className="mt-4 text-sm text-muted-foreground rounded-xl bg-obsidiana/60 border border-border p-4">
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
    </Shell>
  );
}

function CodePlaceholder({ activity, onComplete }: { activity: Activity; onComplete: (c: boolean) => void }) {
  const { t } = useI18n();
  const spec = activity.spec as { language?: string; starter?: string; prompt?: string };
  return (
    <Shell icon={Code2} label={t('activity.code')}>
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
    <div className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground">
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
