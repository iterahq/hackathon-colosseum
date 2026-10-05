/**
 * Design Playground — Trilha do curso · teste de paleta.
 *
 * A tela de curso (`/programs/:slug`) é hoje MONOCROMÁTICA: nó concluído, nó
 * atual, cabeçalho de unidade, eyebrow, troféu do cume — tudo no mesmo
 * evergreen. Numa trilha estilo Duolingo é justamente a cor que faz o olho
 * separar "onde eu estou" de "o que já fechei" e uma seção da seguinte. Este
 * lab existe pra responder UMA pergunta antes de virar decisão: as três cores
 * (#3FD17F, #0066FF, #E07A4A) melhoram a leitura da trilha ou só a deixam
 * barulhenta?
 *
 * Duas propostas, lado a lado com a tela de hoje:
 *   · Por unidade — cada unidade tem sua cor (o modelo do Duolingo). A trilha
 *     vira terreno: você percebe que mudou de seção sem ler o título.
 *   · Por estado — a cor carrega significado fixo na trilha inteira: verde é
 *     concluído, azul é onde você está, terracota é conquista.
 *
 * ⚠️ Isto é uma CÓPIA de playground do `<SkillTree>`, não o componente de
 * produção. O `SkillTree` pinta com classes Tailwind de hex literal
 * (`bg-evergreen`, `text-evergreen-hi`) — não há variável de tema pra
 * sobrescrever de fora, então recolorir o componente real exigiria editar
 * `src/components/`, que é território de desenvolvedor (CODEOWNERS). Validada a
 * paleta, a promoção é PR de dev.
 *
 * As cores entram por `style` inline de propósito: elas ainda não são token, e
 * classe Tailwind montada em runtime (`bg-[${hex}]`) não sobrevive à extração
 * estática.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Code2,
  Flag,
  FolderGit2,
  GitBranch,
  GraduationCap,
  Home,
  Lock,
  Search,
  Settings,
  Trophy,
} from 'lucide-react';

/* ───────────────────────────── Paleta em teste ──────────────────────────── */

type AccentId = 'evergreen' | 'azul' | 'terracota';

type Accent = {
  label: string;
  base: string;
  hi: string;
  soft: string;
  onBase: string;
  contrast: string;
  note: string;
};

/**
 * Cada cor precisa de TRÊS paradas, não uma: preenchimento (`base`), texto sobre
 * o fundo escuro (`hi`) e fundo sutil (`soft`) — é a estrutura que o evergreen
 * já tem no tema. O `contrast` é medido contra o fundo #0A0908 e é o que decide
 * se a parada pode virar texto.
 */
const ACCENTS: Record<AccentId, Accent> = {
  evergreen: {
    label: 'Evergreen',
    base: '#3FD17F',
    hi: '#62D996',
    soft: '#1C3A2A',
    onBase: '#0A0908',
    contrast: '11.2:1',
    note: 'já é o primário da marca',
  },
  azul: {
    label: 'Azul elétrico',
    base: '#0066FF',
    hi: '#6AA5FF',
    soft: '#13233F',
    onBase: '#FFFFFF',
    contrast: '4.1:1',
    note: 'só preenchimento — reprova como texto',
  },
  terracota: {
    label: 'Terracota',
    base: '#E07A4A',
    hi: '#F0A278',
    soft: '#3A2318',
    onBase: '#0A0908',
    contrast: '6.6:1',
    note: 'passa como texto e como fundo',
  },
};

const ACCENT_CYCLE: AccentId[] = ['evergreen', 'azul', 'terracota'];

const MUTED_ACCENT: Accent = {
  label: 'Travado',
  base: '#1C1916',
  hi: '#7D7568',
  soft: '#141210',
  onBase: '#7D7568',
  contrast: '—',
  note: 'estado travado não recebe cor',
};

const alpha = (hex: string, pct: number) =>
  `${hex}${Math.round((pct / 100) * 255)
    .toString(16)
    .padStart(2, '0')}`;

/* ──────────────────────────────── Estratégias ───────────────────────────── */

type StrategyId = 'atual' | 'unidade' | 'estado';
type ProgressId = 'referencia' | 'distribuido';
type NodeState = 'done' | 'current' | 'locked';

const STRATEGIES: { id: StrategyId; label: string }[] = [
  { id: 'atual', label: 'Atual (evergreen)' },
  { id: 'unidade', label: 'Por unidade' },
  { id: 'estado', label: 'Por estado' },
];

const PROGRESSES: { id: ProgressId; label: string }[] = [
  { id: 'referencia', label: 'Como na referência' },
  { id: 'distribuido', label: 'Todos os estados' },
];

const STATE_ACCENT: Record<NodeState, AccentId> = {
  done: 'evergreen',
  current: 'azul',
  locked: 'evergreen',
};

/**
 * Estado agregado da unidade — é o que a faixa lateral mostra na estratégia por
 * estado: unidade fechada é verde, unidade em curso é azul, unidade travada não
 * recebe cor.
 */
function unitState(states: NodeState[]): NodeState {
  if (states.every((state) => state === 'done')) return 'done';
  if (states.every((state) => state === 'locked')) return 'locked';
  return 'current';
}

function accentForUnit(strategy: StrategyId, unitIndex: number, states: NodeState[]): Accent {
  if (strategy === 'unidade') return ACCENTS[ACCENT_CYCLE[unitIndex % ACCENT_CYCLE.length]];
  if (strategy === 'estado') {
    const state = unitState(states);
    return state === 'locked' ? MUTED_ACCENT : ACCENTS[STATE_ACCENT[state]];
  }
  return ACCENTS.evergreen;
}

function accentForNode(strategy: StrategyId, unitIndex: number, state: NodeState): Accent {
  if (state === 'locked') return MUTED_ACCENT;
  if (strategy === 'estado') return ACCENTS[STATE_ACCENT[state]];
  return ACCENTS[ACCENT_CYCLE[unitIndex % ACCENT_CYCLE.length]];
}

/** Conquista e cume têm cor própria nas propostas — é o que os separa do resto. */
function accentForReward(strategy: StrategyId): Accent {
  return strategy === 'atual' ? ACCENTS.evergreen : ACCENTS.terracota;
}

/* ────────────────────────────── Conteúdo da tela ────────────────────────── */

type PathLesson = { id: string; kindLabel: string; title: string };
type PathUnit = { title: string; lessons: [PathLesson, PathLesson] };

const UNITS: PathUnit[] = [
  {
    title: '01 · Processo → Diagrama — mapeie como o trabalho realmente acontece',
    lessons: [
      { id: 'u1-l1', kindLabel: 'Quiz', title: 'Pulses (micro-lições)' },
      { id: 'u1-l2', kindLabel: 'Diagrama', title: 'Commit (o artefato) + Badge' },
    ],
  },
  {
    title: '02 · Diagrama → Modelo de decisão — torne as regras explícitas (DMN)',
    lessons: [
      { id: 'u2-l1', kindLabel: 'Quiz', title: 'Quando a regra vira tabela' },
      { id: 'u2-l2', kindLabel: 'Diagrama', title: 'Commit (a tabela DMN) + Badge' },
    ],
  },
  {
    title: '03 · Modelo de decisão → Agente — coloque a regra pra rodar',
    lessons: [
      { id: 'u3-l1', kindLabel: 'Quiz', title: 'O que o agente decide sozinho' },
      { id: 'u3-l2', kindLabel: 'Code', title: 'Commit (o agente) + Badge' },
    ],
  },
];

/**
 * "Referência" reproduz o print: cada unidade com o primeiro nó atual e o
 * segundo travado. "Distribuído" abre os três estados de uma vez — é onde a
 * paleta realmente aparece, e um teste de cor feito só no estado travado não
 * decide nada.
 */
const PROGRESS_MAP: Record<ProgressId, NodeState[][]> = {
  referencia: [
    ['current', 'locked'],
    ['current', 'locked'],
    ['current', 'locked'],
  ],
  distribuido: [
    ['done', 'done'],
    ['done', 'current'],
    ['locked', 'locked'],
  ],
};

const doneCount = (states: NodeState[]) => states.filter((s) => s === 'done').length;

/* ─────────────────────────────── Instrumentos ───────────────────────────── */

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
        {label}
      </span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`inline-flex items-center h-9 px-3.5 rounded-full border text-sm transition-colors ${
            option.id === value
              ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
              : 'border-border bg-card text-foreground hover:border-evergreen/40'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SwatchCard({ accent }: { accent: Accent }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
      <div
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-mono text-[10px]"
        style={{ backgroundColor: accent.base, color: accent.onBase }}
      >
        Aa
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight" style={{ color: accent.hi }}>
          {accent.label}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground leading-tight mt-0.5">
          {accent.base} · {accent.contrast} · {accent.note}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Chrome da aplicação ───────────────────────── */

function LabTopBar() {
  return (
    <div className="h-14 border-b border-border bg-obsidiana flex items-center gap-4 px-4">
      <span className="font-display font-bold tracking-tight text-ink">
        ITERA<span className="text-evergreen">/</span>
      </span>
      <nav className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-evergreen text-obsidiana text-sm font-medium">
          <Home className="w-3.5 h-3.5" /> Descobrir
        </span>
        <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm text-muted-foreground">
          <GraduationCap className="w-3.5 h-3.5" /> Cursos
        </span>
        <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm text-muted-foreground">
          <FolderGit2 className="w-3.5 h-3.5" /> Meus arquivos
        </span>
      </nav>
      <div className="flex-1 max-w-[560px] mx-auto hidden md:flex items-center gap-2 h-10 px-4 rounded-full border border-border bg-card text-muted-foreground">
        <Search className="w-4 h-4" />
        <span className="text-sm">Buscar cursos, tópicos, conquistas…</span>
      </div>
      <div className="ml-auto flex items-center gap-2 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-evergreen" /> Aluno
        </span>
        <Bell className="w-4 h-4" />
        <Settings className="w-4 h-4" />
        <span className="w-8 h-8 rounded-full bg-evergreen-soft border border-evergreen/30 text-evergreen-hi flex items-center justify-center text-[11px] font-medium">
          JO
        </span>
        <ChevronDown className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}

function CourseSubHeader({ accent }: { accent: Accent }) {
  return (
    <div className="border-b border-border bg-background/95">
      <div className="max-w-[1100px] mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
        <span className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground">
          <ChevronLeft className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div
            className="font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: accent.hi }}
          >
            <GitBranch className="w-3 h-3" /> Programa
          </div>
          <div className="font-display font-semibold truncate leading-tight">
            Domínio → Agente: de analista a arquiteto agêntico
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramHero({ accent }: { accent: Accent }) {
  return (
    <div className="relative rounded-3xl overflow-hidden border border-border bg-obsidiana p-6 md:p-8 mb-8">
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="relative flex items-center gap-5">
        <div
          className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: accent.base, color: accent.onBase }}
        >
          <Code2 className="w-8 h-8" />
        </div>
        <div>
          <span
            className="font-mono text-[11px] uppercase tracking-wider"
            style={{ color: accent.hi }}
          >
            Programa
          </span>
          <h1 className="font-display font-bold text-foreground mt-1">
            Domínio → Agente: de analista a arquiteto agêntico
          </h1>
          <p className="text-sm text-muted-foreground mt-1">3 unidades</p>
        </div>
      </div>
    </div>
  );
}

function JourneyBar({ accent, reward }: { accent: Accent; reward: Accent }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 mb-6">
      <span
        className="font-mono text-xs uppercase tracking-widest flex items-center gap-2"
        style={{ color: accent.hi }}
      >
        <GitBranch className="w-3.5 h-3.5" /> Jornada
      </span>
      <span className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> 6 lições
        </span>
        <span className="text-border">·</span>
        <span className="flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" style={{ color: reward.hi }} /> Conquista
        </span>
      </span>
    </div>
  );
}

function BaseCamp({ accent }: { accent: Accent }) {
  return (
    <div className="flex justify-center mb-2">
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-card font-mono text-xs text-muted-foreground">
        <Flag className="w-3.5 h-3.5" style={{ color: accent.hi }} /> Acampamento base · sua jornada
        começa aqui
      </span>
    </div>
  );
}

/* ──────────────────────────────── A trilha ──────────────────────────────── */

function UnitCard({
  index,
  title,
  done,
  total,
  accent,
  railed,
}: {
  index: number;
  title: string;
  done: number;
  total: number;
  accent: Accent;
  railed: boolean;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-card px-5 py-4 my-6 overflow-hidden">
      {railed && (
        <span
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: accent.base }}
        />
      )}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl font-display font-bold flex items-center justify-center"
          style={{
            backgroundColor: accent.soft,
            border: `1px solid ${alpha(accent.base, 30)}`,
            color: accent.hi,
          }}
        >
          {index + 1}
        </div>
        <div className="min-w-0">
          <div
            className="font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: accent.hi }}
          >
            <GitBranch className="w-3 h-3" /> Unidade
          </div>
          <div className="font-display font-semibold truncate">{title}</div>
        </div>
        <span className="ml-auto font-mono text-xs text-muted-foreground whitespace-nowrap">
          {done}/{total} lições
        </span>
      </div>
    </div>
  );
}

function NodeLabel({
  kindLabel,
  title,
  state,
}: {
  kindLabel: string;
  title: string;
  state: NodeState;
}) {
  return (
    <div className="mt-1.5 flex flex-col items-center text-center max-w-[160px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
        {kindLabel}
      </span>
      <span
        className={`mt-0.5 text-xs font-medium leading-tight ${
          state === 'locked' ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {title}
      </span>
    </div>
  );
}

function PathNode({
  lesson,
  state,
  accent,
  offset,
}: {
  lesson: PathLesson;
  state: NodeState;
  accent: Accent;
  offset: 0 | 1;
}) {
  const filled = state === 'done';

  return (
    <div className="flex flex-col items-center w-full">
      <div
        className="flex flex-col items-center"
        style={{ transform: offset ? 'translateX(24px)' : 'translateX(-24px)' }}
      >
        <div
          className="w-0.5 h-4"
          style={{ backgroundColor: state === 'locked' ? alpha('#7D7568', 30) : alpha(accent.base, 45) }}
        />
        <button
          type="button"
          disabled={state === 'locked'}
          aria-label={lesson.title}
          data-testid={`lab-node-${state}`}
          className="relative w-16 h-16 rounded-2xl flex items-center justify-center transition-transform hover:scale-105 disabled:hover:scale-100 disabled:cursor-not-allowed"
          style={{
            backgroundColor: filled ? accent.base : accent.soft,
            border: filled ? 'none' : `2px solid ${state === 'locked' ? alpha('#7D7568', 25) : accent.base}`,
            color: filled ? accent.onBase : accent.hi,
            boxShadow: state === 'current' ? `0 0 0 6px ${alpha(accent.base, 12)}` : 'none',
          }}
        >
          {state === 'done' ? (
            <Check className="w-7 h-7" strokeWidth={3} />
          ) : state === 'locked' ? (
            <Lock className="w-5 h-5" />
          ) : (
            <BookOpen className="w-6 h-6" />
          )}
        </button>
        <NodeLabel kindLabel={lesson.kindLabel} title={lesson.title} state={state} />
      </div>
    </div>
  );
}

function Summit({ accent }: { accent: Accent }) {
  return (
    <div className="flex flex-col items-center mt-4">
      <div className="w-0.5 h-8" style={{ backgroundColor: alpha(accent.base, 35) }} />
      <div className="flex flex-col items-center gap-2 mt-2">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor: accent.soft,
            border: `1px solid ${alpha(accent.base, 30)}`,
            color: accent.hi,
          }}
        >
          <Trophy className="w-7 h-7" />
        </div>
        <span className="font-display font-semibold text-sm">Conclua o programa</span>
      </div>
    </div>
  );
}

function CoursePath({ strategy, progress }: { strategy: StrategyId; progress: ProgressId }) {
  const states = PROGRESS_MAP[progress];
  const reward = accentForReward(strategy);

  return (
    <div className="min-h-full bg-background flex flex-col" data-testid="color-lab-path">
      <LabTopBar />
      <CourseSubHeader accent={ACCENTS.evergreen} />

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* O chrome fica ancorado no evergreen em todas as estratégias — a cor
            varia na trilha, que é o objeto do teste; só a conquista muda. */}
        <ProgramHero accent={ACCENTS.evergreen} />
        <JourneyBar accent={ACCENTS.evergreen} reward={reward} />
        <BaseCamp accent={ACCENTS.evergreen} />

        {UNITS.map((unit, unitIndex) => (
          <div key={unit.title} className="relative">
            <UnitCard
              index={unitIndex}
              title={unit.title}
              done={doneCount(states[unitIndex])}
              total={unit.lessons.length}
              accent={accentForUnit(strategy, unitIndex, states[unitIndex])}
              railed={strategy !== 'atual'}
            />
            <div className="flex flex-col items-center">
              {unit.lessons.map((lesson, lessonIndex) => (
                <PathNode
                  key={lesson.id}
                  lesson={lesson}
                  state={states[unitIndex][lessonIndex]}
                  accent={accentForNode(strategy, unitIndex, states[unitIndex][lessonIndex])}
                  offset={lessonIndex % 2 === 0 ? 0 : 1}
                />
              ))}
            </div>
          </div>
        ))}

        <Summit accent={reward} />
      </main>
    </div>
  );
}

/* ─────────────────────────────────── Lab ────────────────────────────────── */

function CoursePathColorLab() {
  const [strategy, setStrategy] = useState<StrategyId>('unidade');
  const [progress, setProgress] = useState<ProgressId>('distribuido');

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-8 space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl">Trilha do curso · teste de paleta</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-[86ch]">
          A trilha de hoje é monocromática — nó atual, nó concluído e cabeçalho de unidade dividem o
          mesmo verde, então a hierarquia só existe na forma do ícone. Aqui as três cores entram de
          duas maneiras diferentes pra comparação; “Atual” é a tela de hoje, sem alteração. O trilho
          lateral colorido na unidade faz parte das propostas, não do estado atual.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {ACCENT_CYCLE.map((id) => (
          <SwatchCard key={id} accent={ACCENTS[id]} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Chips label="Paleta" value={strategy} options={STRATEGIES} onChange={(id) => setStrategy(id)} />
        <Chips label="Progresso" value={progress} options={PROGRESSES} onChange={(id) => setProgress(id)} />
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <CoursePath strategy={strategy} progress={progress} />
      </div>
    </div>
  );
}

/* ────────────────────────────────── Meta ────────────────────────────────── */

const meta: Meta = {
  // Fixo: o slug automático do título acentuado gera id com "ó" e o link do
  // Storybook quebra ao ser colado fora do app (mesmo motivo do lab de palco).
  id: 'design-playground-trilha-do-curso-cores',
  title: 'Design Playground/Trilha do Curso · Cores',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
};
export default meta;

export const TrilhaDoCursoCores: StoryObj = {
  name: 'Trilha do curso · paleta em teste',
  render: () => <CoursePathColorLab />,
};
