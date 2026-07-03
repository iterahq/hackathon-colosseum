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
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, GitBranch, Code2, CheckCircle2, XCircle, Construction } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { useAuth } from '@/auth/AuthContext';
import {
  iteraApiConfigured,
  listSeeds,
  generateContext,
  judge,
  type Seed,
  type GeneratedBrief,
  type JudgeVerdict,
} from '@/api/iteraApi';
import { JudgeHeatmap } from './JudgeHeatmap';
// v1 general learning-activity taxonomy (plan 20260703). These CONVERGE on the
// shared InstructionPanel primitive + the `onComplete(correct)` contract.
import { ConceptActivity } from './ConceptActivity';
import { VideoActivity } from './VideoActivity';
import { SingleChoiceActivity } from './SingleChoiceActivity';
import { MultiChoiceActivity } from './MultiChoiceActivity';
import { MatchActivity } from './MatchActivity';
import { OrderActivity } from './OrderActivity';

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
    // v1 general learning-activity taxonomy:
    case 'concept':
      return <ConceptActivity activity={activity} onComplete={onComplete} />;
    case 'video':
      return <VideoActivity activity={activity} onComplete={onComplete} />;
    case 'single_choice':
      return <SingleChoiceActivity activity={activity} onComplete={onComplete} />;
    case 'multi_choice':
      return <MultiChoiceActivity activity={activity} onComplete={onComplete} />;
    case 'match':
      return <MatchActivity activity={activity} onComplete={onComplete} />;
    case 'order':
      return <OrderActivity activity={activity} onComplete={onComplete} />;
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
  const spec = activity.spec as { prompt?: string; body?: string; title?: string };
  const isDone = activity.status === 'done';

  // AI-judge open-scope path: only when the rubric opts in AND the itera-api is
  // configured. Otherwise fall through to the reflection path below (ADR
  // player-judge-surface-guarded — zero regression for course #1).
  const rubric = (activity.rubric ?? {}) as { mode?: string; min_words?: number };
  const isAiJudge = rubric.mode === 'ai-judge' && iteraApiConfigured();
  if (isAiJudge) {
    return <AiJudgeDocumentActivity activity={activity} onComplete={onComplete} />;
  }

  // Reflection path: a document activity with a `min_words` rubric (or no rubric
  // at all) is a "write what you learned" prompt. Round-1 finding #2: it used to
  // render the prompt + a "Mark done" button but NO text input, so the activity
  // was a hollow stub. We now render a real textarea and gate completion on the
  // word count. With no min_words it's a free-form reflection (any non-empty
  // text enables completion). A read-only document (has a body, no prompt) keeps
  // the simple "Mark done" affordance.
  const minWords = typeof rubric.min_words === 'number' ? rubric.min_words : 0;
  const isReflection = Boolean(spec.prompt) || minWords > 0;
  if (isReflection) {
    return (
      <ReflectionDocumentActivity
        activity={activity}
        spec={spec}
        minWords={minWords}
        onComplete={onComplete}
      />
    );
  }

  return (
    <Shell kind="document" icon={FileText} label={t('activity.document')}>
      <h2 className="font-display text-foreground">{spec.prompt ?? spec.title ?? t('activity.document')}</h2>
      {spec.body && (
        <div className="prose prose-invert max-w-none mt-4 text-muted-foreground whitespace-pre-wrap">
          {spec.body}
        </div>
      )}
      <DoneButton done={isDone} onClick={() => onComplete(true)} />
    </Shell>
  );
}

/** Count words in a free-text reflection (whitespace-split, trimmed). */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * A "write what you learned" document activity with a REAL text input. Completion
 * is gated on the rubric's min_words (or any non-empty text when min_words is 0).
 * Fixes round-1 finding #2 (hollow stub: prompt + button, no input).
 */
function ReflectionDocumentActivity({
  activity,
  spec,
  minWords,
  onComplete,
}: {
  activity: Activity;
  spec: { prompt?: string; body?: string; title?: string };
  minWords: number;
  onComplete: (c: boolean) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const isDone = activity.status === 'done';
  const words = countWords(text);
  const meetsMin = words >= Math.max(minWords, 1);

  return (
    <Shell kind="document" icon={FileText} label={t('activity.document')}>
      <h2 className="font-display text-foreground">{spec.prompt ?? spec.title ?? t('activity.document')}</h2>
      {spec.body && (
        <div className="prose prose-invert max-w-none mt-4 text-muted-foreground whitespace-pre-wrap">
          {spec.body}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('activity.reflectionPlaceholder')}
        rows={6}
        data-testid="document-reflection-input"
        className="mt-5 w-full rounded-2xl border border-border bg-background p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-evergreen/40"
      />

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span data-testid="document-word-count">
          {words} {t('activity.words')}
        </span>
        {minWords > 0 && (
          <span data-testid="document-min-words" className={meetsMin ? 'text-evergreen-hi' : ''}>
            {t('activity.minWords')}: {minWords}
          </span>
        )}
      </div>

      <DoneButton done={isDone} disabled={!meetsMin} onClick={() => onComplete(true)} />
    </Shell>
  );
}

/**
 * Open-scope document activity wired to the AI-generation + AI-judge loop:
 *  1) learner optionally picks a domain -> AI generates a contextualized brief
 *     (scenario + an imperfect ER to critique);
 *  2) learner writes their data-spec in a textarea;
 *  3) Submit -> AI judge -> render the heat-map (per-criterion) + feedback.
 * Fluid heat-map (not a hard gate): a pass calls onComplete(true) to advance.
 */
function AiJudgeDocumentActivity({
  activity,
  onComplete,
}: {
  activity: Activity;
  onComplete: (c: boolean) => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const spec = activity.spec as { prompt?: string; body?: string };

  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [brief, setBrief] = useState<GeneratedBrief | null>(null);
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState('');
  const [verdict, setVerdict] = useState<JudgeVerdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSeeds(activity.id).then(setSeeds).catch(() => setSeeds([]));
  }, [activity.id]);

  const token = session?.access_token ?? '';

  async function onPickSeed(seedId: string) {
    if (!token) return;
    setGenerating(true);
    setError(null);
    try {
      const b = await generateContext(activity.id, seedId, token);
      setBrief(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function onSubmit() {
    if (!token || content.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const v = await judge(
        activity.id,
        content,
        token,
        brief
          ? { seed: brief.seed, domain: brief.domain, scenario: brief.scenario, proposed_er: brief.proposed_er }
          : undefined
      );
      setVerdict(v);
      if (v.passed) onComplete(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell kind="document" icon={FileText} label={t('activity.document')}>
      <h2 className="font-display text-foreground">{spec.prompt ?? t('activity.document')}</h2>
      {spec.body && (
        <div className="prose prose-invert max-w-none mt-4 text-muted-foreground whitespace-pre-wrap">
          {spec.body}
        </div>
      )}

      {/* 1) Domain picker -> AI-generated brief */}
      {seeds.length > 0 && !brief && (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground mb-2">
            Escolha um domínio — a IA vai gerar um cenário e um modelo (com falha) pra você criticar:
          </p>
          <div className="flex flex-wrap gap-2">
            {seeds.map((s) => (
              <button
                key={s.id}
                onClick={() => onPickSeed(s.id)}
                disabled={generating}
                className="px-3 py-1.5 rounded-full border border-evergreen/30 bg-evergreen-soft text-evergreen-hi text-sm hover:bg-evergreen-soft/70 disabled:opacity-50"
                data-testid="seed-pick"
              >
                {s.label}
              </button>
            ))}
          </div>
          {generating && <p className="text-xs text-muted-foreground mt-2">Gerando cenário…</p>}
        </div>
      )}

      {brief && (
        <div className="mt-5 rounded-2xl border border-border bg-obsidiana/40 p-4" data-testid="generated-brief">
          <p className="font-mono text-[11px] uppercase tracking-wider text-menta mb-2">
            Cenário gerado · {brief.domain}
          </p>
          <p className="text-sm text-foreground">{brief.scenario}</p>
          <pre className="mt-3 font-mono text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
            {brief.proposed_er}
          </pre>
        </div>
      )}

      {/* 2) Learner submission */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escreva seu data-spec.md: por que você modelou assim + as correções concretas que fez…"
        rows={8}
        className="mt-5 w-full rounded-2xl border border-border bg-background p-4 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-evergreen/40"
        data-testid="judge-submission-input"
      />

      {error && <p className="mt-2 text-sm text-clay">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={submitting || content.trim().length === 0}
        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi disabled:opacity-50"
        data-testid="judge-submit"
      >
        {submitting ? 'Avaliando…' : 'Enviar para avaliação da IA'}
      </button>

      {/* 3) Heat-map verdict */}
      {verdict && <JudgeHeatmap verdict={verdict} />}
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
          className="mt-6 w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

function DoneButton({
  done,
  onClick,
  disabled = false,
}: {
  done?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  // Once completed, the button LOCKS into a "Concluída ✓" state (loop-2 fix #8):
  // in live mode the activity stays on screen after completing (the professor's
  // pointer is what advances), so a still-clickable Done button was confusing.
  // The locked look is a positive "completed" state (menta), NOT the greyed-out
  // "requirement unmet" disabled style.
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
