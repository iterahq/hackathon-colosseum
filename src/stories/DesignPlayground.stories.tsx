/**
 * Design Playground — interactive Storybook tools for prototyping WITHOUT
 * touching app code:
 *
 *   1. Flow Builder   — assemble a sequence of activities (any `ActivityKind`),
 *                       tweak each step's `spec` as JSON, then PLAY the flow in
 *                       the same immersive chrome as the real LessonPlayer
 *                       (full-width progress bar + X + hearts).
 *   2. Component Lab  — pick one activity kind and live-edit its `spec` JSON,
 *                       previewing the rendered component side-by-side.
 *
 * Playground-only code: lives in src/stories/, never shipped in the app bundle.
 * Rendering always goes through the real `ActivityRenderer` — the playground
 * fabricates `Activity` rows, it does NOT duplicate any presentation logic.
 */
import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { motion } from 'framer-motion';
import {
  X,
  Heart,
  Trophy,
  BookOpen,
  PlayCircle,
  CircleDot,
  ListChecks,
  Link2,
  ArrowUpDown,
  HelpCircle,
  FileText,
  GitBranch,
  Code2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity, ActivityKind } from '@/types/content';
import { SAMPLE_IMAGE, SAMPLE_VIDEO } from './activityFixtures';

/** Decorative lives count — mirrors LessonPlayer's inert chrome. */
const DECORATIVE_HEARTS = 5;

/** Palette metadata + a sensible default `spec` per activity kind. */
const KIND_META: Record<ActivityKind, { label: string; icon: LucideIcon; defaultSpec: Record<string, unknown> }> = {
  concept: {
    label: 'Conceito',
    icon: BookOpen,
    defaultSpec: {
      instruction: {
        text: 'Um modelo de dados descreve como as entidades se relacionam.',
        image_url: SAMPLE_IMAGE,
      },
    },
  },
  video: {
    label: 'Vídeo',
    icon: PlayCircle,
    defaultSpec: {
      video_url: SAMPLE_VIDEO,
      instruction: { text: 'Assista à introdução ao modelo relacional.' },
    },
  },
  single_choice: {
    label: 'Escolha única',
    icon: CircleDot,
    defaultSpec: {
      instruction: { text: 'Qual estrutura evita duplicar dados entre tabelas?' },
      options: [
        { id: 'a', label: 'Copiar as colunas para cada tabela' },
        { id: 'b', label: 'Usar uma chave estrangeira (FK)' },
        { id: 'c', label: 'Duplicar a tabela inteira' },
      ],
      correct_option_id: 'b',
    },
  },
  multi_choice: {
    label: 'Múltipla escolha',
    icon: ListChecks,
    defaultSpec: {
      instruction: { text: 'Quais são boas práticas de modelagem relacional?' },
      options: [
        { id: 'a', label: 'Normalizar para evitar redundância' },
        { id: 'b', label: 'Usar chaves estrangeiras para relações' },
        { id: 'c', label: 'Copiar dados entre todas as tabelas' },
        { id: 'd', label: 'Definir chaves primárias' },
      ],
      correct_option_ids: ['a', 'b', 'd'],
    },
  },
  match: {
    label: 'Associação',
    icon: Link2,
    defaultSpec: {
      instruction: { text: 'Associe cada termo à sua definição.' },
      left: [
        { id: 'pk', label: 'Chave primária' },
        { id: 'fk', label: 'Chave estrangeira' },
      ],
      right: [
        { id: 'r-pk', label: 'Identifica unicamente uma linha' },
        { id: 'r-fk', label: 'Referencia a PK de outra tabela' },
      ],
      pairs: [
        { left_id: 'pk', right_id: 'r-pk' },
        { left_id: 'fk', right_id: 'r-fk' },
      ],
    },
  },
  order: {
    label: 'Ordenação',
    icon: ArrowUpDown,
    defaultSpec: {
      instruction: { text: 'Ordene as etapas de modelagem de dados.' },
      items: [
        { id: 's3', label: '3. Normalizar as tabelas' },
        { id: 's1', label: '1. Identificar as entidades' },
        { id: 's2', label: '2. Listar os atributos' },
      ],
      correct_order: ['s1', 's2', 's3'],
    },
  },
  quiz: {
    label: 'Quiz',
    icon: HelpCircle,
    defaultSpec: {
      question: 'Uma chave estrangeira pode ser nula?',
      options: [
        { id: 'true', text: 'Verdadeiro', isCorrect: true },
        { id: 'false', text: 'Falso', isCorrect: false },
      ],
      explanation: 'FKs opcionais são nulas até a relação existir.',
    },
  },
  document: {
    label: 'Documento',
    icon: FileText,
    defaultSpec: {
      prompt: 'Escreva o que você aprendeu sobre modelagem de dados.',
    },
  },
  diagram: {
    label: 'Diagrama',
    icon: GitBranch,
    defaultSpec: {
      prompt: 'Observe a relação 1:N entre clientes e pedidos.',
      mermaid: 'erDiagram\n  CLIENTE ||--o{ PEDIDO : faz\n  PEDIDO }o--|| PRODUTO : contem',
    },
  },
  code: {
    label: 'Código',
    icon: Code2,
    defaultSpec: {
      language: 'sql',
      prompt: 'Crie a tabela de pedidos.',
      starter: 'CREATE TABLE pedidos (\n  id SERIAL PRIMARY KEY\n);',
    },
  },
};

const ALL_KINDS = Object.keys(KIND_META) as ActivityKind[];

/** One editable step of a prototyped flow. `specJson` is the source of truth
 *  while editing; it only becomes an `Activity` when the JSON parses. */
interface FlowStep {
  uid: string;
  kind: ActivityKind;
  specJson: string;
}

let stepSeq = 0;
function makeStep(kind: ActivityKind): FlowStep {
  stepSeq += 1;
  return {
    uid: `pg-step-${stepSeq}`,
    kind,
    specJson: JSON.stringify(KIND_META[kind].defaultSpec, null, 2),
  };
}

/** Parse a step's JSON. Returns the spec or `null` when invalid. */
function parseSpec(json: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stepToActivity(step: FlowStep, ordinal: number): Activity {
  return {
    id: step.uid,
    lessonId: 'playground-lesson',
    ordinal,
    kind: step.kind,
    spec: parseSpec(step.specJson) ?? {},
    rubric: null,
  };
}

/* ────────────────────────── Flow player (play mode) ───────────────────────── */

/** Steps through the prototyped flow in the LessonPlayer's immersive chrome:
 *  full-width progress bar, inert X + hearts, centered 640px activity column.
 *  No persistence — completion just tallies correct/incorrect for the summary. */
function FlowPlayer({ steps, onExit }: { steps: FlowStep[]; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  // Bumping the run id remounts every activity so internal state resets on replay.
  const [run, setRun] = useState(0);

  const activities = useMemo(() => steps.map(stepToActivity), [steps]);
  const finished = index >= activities.length;
  const current = activities[index];
  const progressPct = activities.length
    ? Math.round(((finished ? activities.length : index) / activities.length) * 100)
    : 0;
  const correctCount = results.filter(Boolean).length;

  function handleComplete(correct: boolean) {
    setResults((prev) => [...prev, correct]);
    setIndex((i) => i + 1);
  }

  function replay() {
    setIndex(0);
    setResults([]);
    setRun((r) => r + 1);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="relative">
        <div
          className="h-1 w-full bg-muted"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do fluxo"
        >
          <motion.div
            className="h-full bg-evergreen"
            initial={false}
            animate={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onExit}
            aria-label="Voltar ao editor"
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="inline-flex items-center gap-1.5 text-clay font-medium">
            <Heart className="w-5 h-5 fill-current" /> {DECORATIVE_HEARTS}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pb-16">
        <div style={{ width: 'min(640px, 100%)' }}>
          {!finished && current && (
            <>
              <p className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi text-center mt-4">
                Fluxo de teste · {index + 1} de {activities.length}
              </p>
              <h1 className="font-display font-bold text-2xl text-foreground text-center mt-1 mb-8">
                Design Playground
              </h1>
              <ActivityRenderer
                key={`run-${run}-${current.id}`}
                activity={current}
                onComplete={handleComplete}
              />
            </>
          )}

          {finished && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-24 rounded-3xl border border-border bg-card p-10 text-center"
            >
              <Trophy className="w-12 h-12 text-evergreen-hi mx-auto" />
              <h2 className="font-display font-bold text-2xl text-foreground mt-4">Fluxo concluído!</h2>
              <p className="text-muted-foreground mt-2">
                {correctCount} de {activities.length} atividades corretas.
              </p>
              <div className="mt-8 flex items-center justify-center gap-3">
                <button
                  onClick={replay}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-border text-foreground hover:bg-muted transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Jogar de novo
                </button>
                <button
                  onClick={onExit}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
                >
                  Voltar ao editor
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ───────────────────────── Flow builder (edit mode) ───────────────────────── */

function FlowBuilderPlayground() {
  const [steps, setSteps] = useState<FlowStep[]>([
    makeStep('concept'),
    makeStep('quiz'),
    makeStep('order'),
  ]);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const invalidCount = steps.filter((s) => parseSpec(s.specJson) === null).length;
  const canPlay = steps.length > 0 && invalidCount === 0;

  function addStep(kind: ActivityKind) {
    const step = makeStep(kind);
    setSteps((prev) => [...prev, step]);
    setOpenUid(step.uid);
  }

  function removeStep(uid: string) {
    setSteps((prev) => prev.filter((s) => s.uid !== uid));
  }

  function moveStep(uid: string, delta: -1 | 1) {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.uid === uid);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function patchStep(uid: string, patch: Partial<FlowStep>) {
    setSteps((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  }

  if (playing) {
    return <FlowPlayer steps={steps} onExit={() => setPlaying(false)} />;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">Design Playground</p>
            <h1 className="font-display font-bold text-2xl text-foreground mt-1">Flow Builder</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monte uma sequência de atividades, edite os specs e teste o fluxo como uma lição real.
            </p>
          </div>
          <button
            onClick={() => setPlaying(true)}
            disabled={!canPlay}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" /> Testar fluxo
          </button>
        </div>

        {invalidCount > 0 && (
          <p className="mt-3 text-sm text-clay">
            {invalidCount} {invalidCount === 1 ? 'passo tem' : 'passos têm'} JSON inválido — corrija antes de testar.
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
          {/* Palette */}
          <aside className="rounded-3xl border border-border bg-card p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
              Adicionar atividade
            </p>
            <div className="space-y-1.5">
              {ALL_KINDS.map((kind) => {
                const { label, icon: Icon } = KIND_META[kind];
                return (
                  <button
                    key={kind}
                    onClick={() => addStep(kind)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-foreground border border-transparent hover:border-evergreen/40 hover:bg-evergreen-soft transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-evergreen-hi shrink-0" />
                    <span className="flex-1">{label}</span>
                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Step list */}
          <section className="space-y-3">
            {steps.length === 0 && (
              <div className="rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground text-sm">
                Fluxo vazio — adicione atividades pela paleta ao lado.
              </div>
            )}
            {steps.map((step, i) => {
              const { label, icon: Icon } = KIND_META[step.kind];
              const spec = parseSpec(step.specJson);
              const open = openUid === step.uid;
              return (
                <div
                  key={step.uid}
                  className={`rounded-2xl border bg-card ${spec === null ? 'border-clay/60' : 'border-border'}`}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground w-6 text-right">{i + 1}</span>
                    <Icon className="w-4 h-4 text-evergreen-hi shrink-0" />
                    <button
                      onClick={() => setOpenUid(open ? null : step.uid)}
                      className="flex-1 text-left text-sm font-medium text-foreground hover:text-evergreen-hi transition-colors"
                    >
                      {label}
                      {spec === null && <span className="ml-2 text-xs text-clay">JSON inválido</span>}
                    </button>
                    <button
                      onClick={() => moveStep(step.uid, -1)}
                      disabled={i === 0}
                      aria-label="Mover para cima"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveStep(step.uid, 1)}
                      disabled={i === steps.length - 1}
                      aria-label="Mover para baixo"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeStep(step.uid)}
                      aria-label="Remover passo"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-clay hover:bg-muted transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {open && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      <label className="flex items-center gap-3 text-sm text-muted-foreground">
                        Tipo
                        <select
                          value={step.kind}
                          onChange={(e) => {
                            const kind = e.target.value as ActivityKind;
                            patchStep(step.uid, {
                              kind,
                              specJson: JSON.stringify(KIND_META[kind].defaultSpec, null, 2),
                            });
                          }}
                          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                        >
                          {ALL_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {KIND_META[k].label}
                            </option>
                          ))}
                        </select>
                        <span className="font-mono text-xs">({step.kind})</span>
                      </label>
                      <textarea
                        value={step.specJson}
                        onChange={(e) => patchStep(step.uid, { specJson: e.target.value })}
                        rows={Math.min(18, step.specJson.split('\n').length + 1)}
                        spellCheck={false}
                        className={`w-full rounded-xl border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-evergreen/40 ${
                          spec === null ? 'border-clay/60' : 'border-border'
                        }`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Component lab story ───────────────────────────
 * Pick ONE kind + live-edit its spec JSON; the preview renders through the real
 * ActivityRenderer and keeps the last VALID spec while you type. */

function ComponentLabPlayground() {
  const [kind, setKind] = useState<ActivityKind>('single_choice');
  const [specJson, setSpecJson] = useState(() => JSON.stringify(KIND_META.single_choice.defaultSpec, null, 2));
  const [lastValidSpec, setLastValidSpec] = useState<Record<string, unknown>>(KIND_META.single_choice.defaultSpec);
  // Remount key: bumping resets the previewed component's internal state.
  const [resetCount, setResetCount] = useState(0);

  const parsed = parseSpec(specJson);
  const invalid = parsed === null;

  function onJsonChange(value: string) {
    setSpecJson(value);
    const next = parseSpec(value);
    if (next !== null) setLastValidSpec(next);
  }

  function onKindChange(next: ActivityKind) {
    setKind(next);
    const spec = KIND_META[next].defaultSpec;
    setSpecJson(JSON.stringify(spec, null, 2));
    setLastValidSpec(spec);
    setResetCount((c) => c + 1);
  }

  const activity: Activity = {
    id: `lab-${kind}`,
    lessonId: 'playground-lab',
    ordinal: 0,
    kind,
    spec: lastValidSpec,
    rubric: null,
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <p className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">Design Playground</p>
        <h1 className="font-display font-bold text-2xl text-foreground mt-1">Component Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edite o spec JSON e veja o componente de atividade renderizado ao vivo.
        </p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Editor */}
          <div className="rounded-3xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                Tipo
                <select
                  value={kind}
                  onChange={(e) => onKindChange(e.target.value as ActivityKind)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                >
                  {ALL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_META[k].label} ({k})
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => setResetCount((c) => c + 1)}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border text-sm text-foreground hover:bg-muted transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Resetar estado
              </button>
            </div>
            <textarea
              value={specJson}
              onChange={(e) => onJsonChange(e.target.value)}
              rows={24}
              spellCheck={false}
              className={`w-full rounded-xl border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-evergreen/40 ${
                invalid ? 'border-clay/60' : 'border-border'
              }`}
            />
            {invalid && <p className="text-xs text-clay">JSON inválido — o preview mostra o último spec válido.</p>}
          </div>

          {/* Live preview */}
          <div className="rounded-3xl border border-dashed border-border p-6">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-4">Preview</p>
            <div style={{ width: 'min(640px, 100%)', margin: '0 auto' }}>
              <ActivityRenderer
                key={`lab-${kind}-${resetCount}`}
                activity={activity}
                onComplete={() => {}}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────── Meta ─────────────────────────────────── */

const meta: Meta = {
  title: 'Design Playground',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
};
export default meta;

export const FlowBuilder: StoryObj = {
  name: 'Flow Builder',
  render: () => <FlowBuilderPlayground />,
};

export const ComponentLab: StoryObj = {
  name: 'Component Lab',
  render: () => <ComponentLabPlayground />,
};
