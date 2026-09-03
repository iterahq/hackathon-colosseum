/**
 * Design Playground — Live Sidebar Lab.
 *
 * A workbench to iterate on the INSTRUCTOR sidebar of the live class (the
 * "run the room" surface the professor drives while the Meet call happens).
 * It renders a redesign PROPOSAL — and, in the compare story, the current
 * production `LiveSidebar` side by side — against a simulated room: buttons
 * inject correct/wrong answers, students join, the shared timer counts down.
 *
 * Brand decisions baked into the proposal (brand.devfellowship.com/itera):
 *   - Clay is RESERVED for Q&A. The current sidebar uses it on primary actions
 *     (Próxima / Iniciar / position counter) — the proposal moves every action
 *     to evergreen and keeps ONE primary green CTA per surface (Próxima).
 *   - Wrong answers use the destructive token (status red), not clay.
 *   - Section titles: Barlow Condensed (font-display), larger, evergreen-hi —
 *     designer note #1 (bigger + colored for distinction).
 *   - Timer is a "player": round toggle button + big JetBrains Mono countdown
 *     + progress track — designer note #2.
 *   - Próxima is the hero CTA with a segmented position stepper — note #3.
 *   - Pedagogical layer: big stat numbers + a contextual insight line ("a
 *     maioria errou — vale revisar") so the professor can decide whether to
 *     advance or review — the sidebar as teaching support, not just telemetry.
 *
 * Playground-only code (design-playground/): the proposal does NOT touch the
 * production components; approve here first, then port.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { motion } from 'framer-motion';
import {
  Play,
  Square,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  XCircle,
  Circle,
  Link2,
  Users,
  Radio,
  Trophy,
  LayoutGrid,
  Lightbulb,
  Plus,
  RotateCcw,
  UserMinus,
  PartyPopper,
  MoreHorizontal,
  ChevronDown,
  MonitorPlay,
  X,
} from 'lucide-react';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { InstructorControls } from '@/components/live/InstructorControls';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import { formatMmss } from '@/utils/formatMmss';
import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';

/* ─────────────────────────────── Simulation ─────────────────────────────── */

const PROF: ClassPresenceMember = { userId: 'prof', name: 'Prof. Tainan', avatarUrl: null, isInstructor: true };
const INITIAL_STUDENTS = ['Ana Souza', 'Bruno Lima', 'Caio Mendes', 'Duda Rocha'];
const EXTRA_STUDENTS = ['Elisa Prado', 'Felipe Nunes', 'Gabi Torres', 'Hugo Reis', 'Iara Melo'];

const TIMER_TOTAL = 60;
const ACTIVITY_COUNT = 5;

/** Uma colocação no pódio de fim de aula (placar acumulado, não da atividade). */
interface PodiumEntry {
  userId: string;
  name: string;
  correct: number;
  answered: number;
  totalMs: number;
  rank: number;
}

interface RoomSim {
  inReception: boolean;
  activityIndex: number;
  roster: ClassPresenceMember[];
  answerers: ClassAnswerer[];
  ranking: ClassRanking;
  timer: { running: boolean; total: number; remaining: number };
  allAnswered: boolean;
  /** Aula encerrada — o painel troca a sala pelo pódio. */
  finished: boolean;
  podium: PodiumEntry[];
  /** Alunos no palco, na ordem em que foram chamados. */
  onStage: string[];
}

/** Build the speed ranking from the simulated single-activity answers. */
function buildRanking(answerers: ClassAnswerer[]): ClassRanking {
  const ranked = answerers
    .filter((a) => a.state !== 'pending' && typeof a.elapsedMs === 'number')
    .sort((x, y) => (x.elapsedMs ?? 0) - (y.elapsedMs ?? 0))
    .map((a, i) => ({
      userId: a.userId,
      name: a.name,
      avatarUrl: a.avatarUrl,
      totalMs: a.elapsedMs ?? 0,
      answeredCount: 1,
      correctCount: a.state === 'done' ? 1 : 0,
      rank: i + 1,
    }));
  const waiting = answerers
    .filter((a) => a.state === 'pending')
    .map((a) => ({ userId: a.userId, name: a.name, avatarUrl: a.avatarUrl }));
  return { ranked, waiting };
}

/* ──────────────────── Proposal building blocks (V2) ─────────────────────── */

/** Designer note #1 — section titles: bigger, font-display, evergreen-hi. */
function SectionTitle({
  icon: Icon,
  title,
  right,
}: {
  icon: React.ElementType;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3.5">
      <Icon className="w-4 h-4 text-evergreen-hi" aria-hidden />
      <h3 className="font-display font-semibold text-base uppercase tracking-wide text-evergreen-hi leading-none">
        {title}
      </h3>
      {right !== undefined && <span className="ml-auto">{right}</span>}
    </div>
  );
}

/** Mono count badge used at the right of section titles. */
function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-sm tabular-nums text-foreground/80">{children}</span>
  );
}

/** Designer note #3 — segmented position stepper + hero Próxima CTA. */
function FlowControlsV2({
  activityIndex,
  activityCount,
  canPrev,
  canNext,
  allAnswered,
  onPrev,
  onNext,
  isLast = false,
  onFinish,
}: {
  activityIndex: number;
  activityCount: number;
  canPrev: boolean;
  canNext: boolean;
  allAnswered: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Última atividade: o CTA vira "encerrar e ver o pódio" (v3). Opcional para
   *  a v2 seguir com o comportamento original. */
  isLast?: boolean;
  onFinish?: () => void;
}) {
  const finishMode = isLast && Boolean(onFinish);
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Atividade
        </span>
        <div className="flex-1 flex gap-1" aria-hidden>
          {Array.from({ length: activityCount }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < activityIndex
                  ? 'bg-evergreen/50'
                  : i === activityIndex
                    ? 'bg-evergreen'
                    : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {activityIndex + 1}/{activityCount}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Atividade anterior"
          className="w-11 h-11 shrink-0 grid place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:border-evergreen/40 transition-colors disabled:opacity-35"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={finishMode ? onFinish : onNext}
          disabled={finishMode ? false : !canNext}
          data-testid={finishMode ? 'flow-finish' : 'flow-next'}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full bg-evergreen text-obsidiana font-display font-semibold text-[15px] uppercase tracking-wide hover:bg-evergreen-hi transition-all disabled:opacity-35 ${
            allAnswered && (canNext || finishMode) ? 'ring-2 ring-evergreen-hi/70 ring-offset-2 ring-offset-card' : ''
          }`}
        >
          {finishMode ? (
            <>
              <Trophy className="w-4 h-4" /> Ver pódio
            </>
          ) : (
            <>
              Próxima <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/** Designer note #2 — the timer as a modern "player": round toggle + big mono
 *  countdown + a depleting progress track. Low time (≤10s) shifts to red. */
function TimerPlayerV2({
  running,
  total,
  remaining,
  onToggle,
}: {
  running: boolean;
  total: number;
  remaining: number;
  onToggle: () => void;
}) {
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const low = running && remaining <= 10;
  return (
    <div className="rounded-2xl border border-border bg-background p-3 flex items-center gap-3">
      <button
        onClick={onToggle}
        aria-label={running ? 'Parar tempo' : 'Iniciar tempo'}
        className={`w-11 h-11 shrink-0 grid place-items-center rounded-full border transition-colors ${
          running
            ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
            : 'border-evergreen/40 bg-evergreen-soft text-evergreen-hi hover:border-evergreen'
        }`}
      >
        {running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-px" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Tempo da atividade
          </span>
          <span
            className={`font-mono text-xl tabular-nums leading-none ${
              low ? 'text-destructive' : 'text-foreground'
            }`}
          >
            {formatMmss(running ? remaining : total)}
          </span>
        </div>
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
              low ? 'bg-destructive' : 'bg-evergreen'
            }`}
            style={{ width: `${running ? pct : 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** Pedagogical read of the room — tells the professor whether to review or
 *  advance instead of leaving raw numbers to interpret mid-class. */
function insightLine(correct: number, wrong: number, pending: number, total: number): string | null {
  if (total === 0) return null;
  const answered = correct + wrong;
  if (answered === 0) return 'Aguardando as primeiras respostas…';
  if (pending === 0 && wrong === 0) return 'Turma inteira acertou — pode avançar.';
  if (pending === 0) return wrong > correct
    ? 'A maioria errou — vale revisar antes de avançar.'
    : 'Todos responderam. Vale comentar os erros antes de seguir.';
  if (wrong > correct && answered >= 2) return 'Muitos erros até agora — considere dar uma dica.';
  return null;
}

function ActivityStatsV2({ kind, answerers }: { kind: string; answerers: ClassAnswerer[] }) {
  const total = answerers.length;
  const correct = answerers.filter((a) => a.state === 'done').length;
  const wrong = answerers.filter((a) => a.state === 'wrong').length;
  const pending = total - correct - wrong;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const insight = insightLine(correct, wrong, pending, total);

  const stats = [
    { key: 'correct', value: correct, label: 'Acertaram', cls: 'text-menta', Icon: CheckCircle2 },
    { key: 'wrong', value: wrong, label: 'Erraram', cls: 'text-destructive', Icon: XCircle },
    { key: 'waiting', value: pending, label: 'Aguardando', cls: 'text-muted-foreground', Icon: Circle },
  ];

  return (
    <section className="p-5" data-proposal="activity-stats">
      <SectionTitle
        icon={LayoutGrid}
        title="Atividade"
        right={
          <span className="inline-flex items-center px-2 h-5 rounded-full bg-evergreen-soft font-mono text-[10px] uppercase tracking-wider text-evergreen-hi">
            {kind.replace(/_/g, ' ')}
          </span>
        }
      />

      {/* Big at-a-glance trio — the numbers ARE the interface mid-class. */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {stats.map(({ key, value, label, cls, Icon }) => (
          <div key={key} className="rounded-2xl bg-background border border-border py-3 flex flex-col items-center gap-1">
            <span className={`font-mono text-2xl tabular-nums leading-none ${value > 0 ? cls : 'text-muted-foreground/60'}`}>
              {value}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Icon className={`w-3 h-3 ${cls}`} /> {label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden flex" aria-hidden>
        <div className="h-full bg-menta transition-[width] duration-300" style={{ width: `${pct(correct)}%` }} />
        <div className="h-full bg-destructive/80 transition-[width] duration-300" style={{ width: `${pct(wrong)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {correct + wrong} de {total} responderam
      </p>

      {insight && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-evergreen-soft/60 px-3 py-2.5 text-xs text-foreground/90">
          <Lightbulb className="w-3.5 h-3.5 text-evergreen-hi shrink-0 mt-px" />
          {insight}
        </p>
      )}
    </section>
  );
}

function RosterV2({ roster, selfUserId }: { roster: ClassPresenceMember[]; selfUserId?: string }) {
  const groups = [
    { key: 'instructors', label: 'Instrutores', members: roster.filter((m) => m.isInstructor) },
    { key: 'learners', label: 'Devs', members: roster.filter((m) => !m.isInstructor) },
  ].filter((g) => g.members.length > 0);

  return (
    <section className="p-5">
      <SectionTitle icon={Users} title="Na sala" right={<CountBadge>{roster.length}</CountBadge>} />
      <div className="space-y-3.5">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{g.label}</p>
            <ul className="space-y-1.5">
              {g.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5 text-sm text-foreground">
                  <LiveAvatar name={m.name} avatarUrl={m.avatarUrl} size="w-6 h-6" />
                  <span className="truncate">{m.name}</span>
                  {m.userId === selfUserId && (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">· você</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnswerersV2({ answerers }: { answerers: ClassAnswerer[] }) {
  const answered = answerers.filter((a) => a.state !== 'pending').length;
  return (
    <section className="p-5">
      <SectionTitle
        icon={Radio}
        title="Responderam"
        right={<CountBadge>{answered}/{answerers.length}</CountBadge>}
      />
      {answerers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém na atividade ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {answerers.map((a) => (
            <li key={a.userId} className="flex items-center gap-2.5 text-sm" data-state={a.state}>
              <LiveAvatar name={a.name} avatarUrl={a.avatarUrl} size="w-6 h-6" />
              <span className={`truncate ${a.state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
                {a.name}
              </span>
              <span className="ml-auto flex items-center gap-2 shrink-0">
                {a.state !== 'pending' && typeof a.elapsedMs === 'number' && (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatMmss(Math.round(a.elapsedMs / 1000))}
                  </span>
                )}
                {a.state === 'done' ? (
                  <CheckCircle2 className="w-4 h-4 text-menta" />
                ) : a.state === 'wrong' ? (
                  <XCircle className="w-4 h-4 text-destructive/90" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/50" />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RankingV2({ ranking }: { ranking: ClassRanking }) {
  const MEDALS = ['🥇', '🥈', '🥉'];
  return (
    <section className="p-5">
      <SectionTitle icon={Trophy} title="Ranking" right={<CountBadge>{ranking.ranked.length}</CountBadge>} />
      {ranking.ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém respondeu ainda.</p>
      ) : (
        <ol className="space-y-1.5">
          {ranking.ranked.map((r) => (
            <li key={r.userId} className="flex items-center gap-2.5 text-sm">
              <span className="w-6 text-center font-mono tabular-nums text-muted-foreground shrink-0">
                {MEDALS[r.rank - 1] ?? r.rank}
              </span>
              <LiveAvatar name={r.name} avatarUrl={r.avatarUrl} size="w-6 h-6" />
              <span className="text-foreground truncate">{r.name}</span>
              <span className="ml-auto flex items-center gap-2 shrink-0 font-mono text-xs tabular-nums">
                <span className="text-muted-foreground">{r.correctCount}/{r.answeredCount}</span>
                <span className="text-evergreen-hi">{formatMmss(Math.round(r.totalMs / 1000))}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {ranking.waiting.length > 0 && (
        <ul className="mt-2.5 pt-2.5 border-t border-border/60 space-y-1.5">
          {ranking.waiting.map((w) => (
            <li key={w.userId} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="w-6 text-center shrink-0">·</span>
              <LiveAvatar name={w.name} avatarUrl={w.avatarUrl} size="w-5 h-5" />
              <span className="truncate">{w.name}</span>
              <span className="ml-auto text-xs">aguardando</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The full proposed sidebar. Same information architecture as production —
 *  reorganized: pinned flow cluster on top, pedagogy in the middle, discreet
 *  management actions at the foot. */
function ProposedSidebar({
  sim,
  onPrev,
  onNext,
  onBegin,
  onToggleTimer,
}: {
  sim: RoomSim;
  onPrev: () => void;
  onNext: () => void;
  onBegin: () => void;
  onToggleTimer: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <aside
      className="w-[340px] shrink-0 rounded-3xl border border-border bg-card flex flex-col overflow-hidden"
      data-testid="proposed-sidebar"
    >
      {/* ── Pinned flow cluster ── */}
      <div className="p-5 space-y-3.5 border-b border-border">
        {sim.inReception ? (
          <button
            onClick={onBegin}
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-evergreen text-obsidiana font-display font-semibold text-[15px] uppercase tracking-wide hover:bg-evergreen-hi transition-colors"
          >
            <Play className="w-4 h-4" /> Começar aula
          </button>
        ) : (
          <>
            <FlowControlsV2
              activityIndex={sim.activityIndex}
              activityCount={ACTIVITY_COUNT}
              canPrev={sim.activityIndex > 0}
              canNext={sim.activityIndex < ACTIVITY_COUNT - 1}
              allAnswered={sim.allAnswered}
              onPrev={onPrev}
              onNext={onNext}
            />
            <TimerPlayerV2
              running={sim.timer.running}
              total={sim.timer.total}
              remaining={sim.timer.remaining}
              onToggle={onToggleTimer}
            />
          </>
        )}
      </div>

      {/* ── Pedagogy + room ── */}
      <div className="flex-1 divide-y divide-border">
        {!sim.inReception && <ActivityStatsV2 kind="multi_choice" answerers={sim.answerers} />}
        <RosterV2 roster={sim.roster} selfUserId="prof" />
        {!sim.inReception && <AnswerersV2 answerers={sim.answerers} />}
        {!sim.inReception && <RankingV2 ranking={sim.ranking} />}
      </div>

      {/* ── Discreet management foot ── */}
      <div className="border-t border-border p-5 space-y-2">
        <button
          onClick={() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-evergreen/40 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-menta" /> Link copiado
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4" /> Copiar link de entrada
            </>
          )}
        </button>
        <button className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full text-sm font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors">
          <Square className="w-3 h-3" /> Encerrar aula
        </button>
      </div>
    </aside>
  );
}

/* ─────────────────────────── Lab harness + stories ──────────────────────── */

let extraSeq = 0;
/** IDs precisam ser ESTÁVEIS: derivá-los do índice do array (`s-${i}`) fazia as
 *  respostas e o placar de um aluno migrarem para outro quando alguém saía da
 *  sala — o que a remoção pelo professor passa a permitir. */
let studentSeq = 0;

interface Student {
  id: string;
  name: string;
}

function makeStudent(name: string): Student {
  studentSeq += 1;
  return { id: `s-${studentSeq}`, name };
}

/** Placar acumulado da AULA (não da atividade) — é o que alimenta o pódio. */
interface Score {
  correct: number;
  answered: number;
  totalMs: number;
}

function useRoomSim() {
  const [inReception, setInReception] = useState(false);
  const [activityIndex, setActivityIndex] = useState(3);
  const [students, setStudents] = useState<Student[]>(() => INITIAL_STUDENTS.map(makeStudent));
  const [answers, setAnswers] = useState<Map<string, { state: 'done' | 'wrong'; elapsedMs: number }>>(new Map());
  const [scores, setScores] = useState<Map<string, Score>>(new Map());
  /** Quem está no palco sendo acompanhado ao vivo (ordem de chamada). */
  const [onStage, setOnStage] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [remaining, setRemaining] = useState(TIMER_TOTAL);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // `avatarUrl` é obrigatório (string | null) nos tipos de liveClass — sem ele o
  // fixture só compila porque design-playground/ fica fora do tsconfig.
  const roster: ClassPresenceMember[] = useMemo(
    () => [PROF, ...students.map((s) => ({ userId: s.id, name: s.name, avatarUrl: null, isInstructor: false }))],
    [students],
  );

  const answerers: ClassAnswerer[] = useMemo(
    () =>
      students.map((s) => {
        const a = answers.get(s.id);
        return a
          ? { userId: s.id, name: s.name, avatarUrl: null, state: a.state, elapsedMs: a.elapsedMs }
          : { userId: s.id, name: s.name, avatarUrl: null, state: 'pending' as const };
      }),
    [students, answers],
  );

  const ranking = useMemo(() => buildRanking(answerers), [answerers]);
  const allAnswered = answerers.length > 0 && answerers.every((a) => a.state !== 'pending');

  /** Pódio da aula: mais acertos primeiro, empate desempatado pelo tempo. */
  const podium: PodiumEntry[] = useMemo(() => {
    return students
      .map((s) => {
        const sc = scores.get(s.id) ?? { correct: 0, answered: 0, totalMs: 0 };
        return { userId: s.id, name: s.name, ...sc };
      })
      .filter((e) => e.answered > 0)
      .sort((a, b) => (b.correct - a.correct) || (a.totalMs - b.totalMs))
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }, [students, scores]);

  function simulateAnswer(correct: boolean) {
    const next = answerers.find((a) => a.state === 'pending');
    if (!next) return;
    const elapsedMs = 4000 + Math.round(Math.random() * 36000);
    setAnswers((prev) => new Map(prev).set(next.userId, { state: correct ? 'done' : 'wrong', elapsedMs }));
    // O placar da aula acumula ATRAVÉS das atividades (não zera ao avançar).
    setScores((prev) => {
      const cur = prev.get(next.userId) ?? { correct: 0, answered: 0, totalMs: 0 };
      return new Map(prev).set(next.userId, {
        correct: cur.correct + (correct ? 1 : 0),
        answered: cur.answered + 1,
        totalMs: cur.totalMs + elapsedMs,
      });
    });
  }

  /** Só a atividade corrente — usado ao navegar (o placar da aula sobrevive). */
  function resetCurrent() {
    setAnswers(new Map());
  }

  /** Botão do lab: zera atividade E placar acumulado. */
  function resetAnswers() {
    setAnswers(new Map());
    setScores(new Map());
  }

  function goTo(delta: -1 | 1) {
    setActivityIndex((i) => Math.max(0, Math.min(ACTIVITY_COUNT - 1, i + delta)));
    resetCurrent();
    setTimerRunning(false);
    setRemaining(TIMER_TOTAL);
  }

  function addStudent() {
    setStudents((prev) =>
      prev.length - INITIAL_STUDENTS.length < EXTRA_STUDENTS.length
        ? [...prev, makeStudent(EXTRA_STUDENTS[(extraSeq++) % EXTRA_STUDENTS.length])]
        : prev,
    );
  }

  /** Professor tira o aluno da aula: sai da lista, das respostas, do placar e do
   *  palco — nada dele pode sobrar pendurado. */
  function removeStudent(userId: string) {
    setStudents((prev) => prev.filter((s) => s.id !== userId));
    setAnswers((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
    setScores((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
    setOnStage((prev) => prev.filter((id) => id !== userId));
  }

  /** Chama ao palco / tira do palco (o mesmo botão alterna). */
  function toggleStage(userId: string) {
    setOnStage((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function finish() {
    setFinished(true);
    setTimerRunning(false);
  }

  function resume() {
    setFinished(false);
  }

  function toggleTimer() {
    if (timerRunning) {
      setTimerRunning(false);
      setRemaining(TIMER_TOTAL);
    } else {
      setRemaining(TIMER_TOTAL);
      setTimerRunning(true);
    }
  }

  /** "+tempo" do professor — o controle de produção espera este callback. */
  function addTime(seconds: number) {
    setRemaining((r) => r + seconds);
  }

  const sim: RoomSim = {
    inReception,
    activityIndex,
    roster,
    answerers,
    ranking,
    timer: { running: timerRunning, total: TIMER_TOTAL, remaining },
    allAnswered,
    finished,
    podium,
    onStage,
  };

  return {
    sim,
    simulateAnswer,
    resetAnswers,
    addStudent,
    removeStudent,
    toggleStage,
    toggleTimer,
    addTime,
    setInReception,
    finish,
    resume,
    goTo,
  };
}

function LabControls({
  room,
}: {
  room: ReturnType<typeof useRoomSim>;
}) {
  const pendingLeft = room.sim.answerers.some((a) => a.state === 'pending');
  const btn =
    'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border bg-card text-sm text-foreground hover:border-evergreen/40 transition-colors disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
        Simular sala
      </span>
      <button className={btn} disabled={room.sim.inReception || !pendingLeft} onClick={() => room.simulateAnswer(true)}>
        <CheckCircle2 className="w-3.5 h-3.5 text-menta" /> Resposta certa
      </button>
      <button className={btn} disabled={room.sim.inReception || !pendingLeft} onClick={() => room.simulateAnswer(false)}>
        <XCircle className="w-3.5 h-3.5 text-destructive" /> Resposta errada
      </button>
      <button className={btn} onClick={room.addStudent}>
        <Plus className="w-3.5 h-3.5" /> Aluno entra
      </button>
      <button className={btn} disabled={room.sim.inReception} onClick={room.resetAnswers}>
        <RotateCcw className="w-3.5 h-3.5" /> Limpar respostas
      </button>
      <label className="inline-flex items-center gap-2 text-sm text-muted-foreground ml-2 cursor-pointer">
        <input
          type="checkbox"
          checked={room.sim.inReception}
          onChange={(e) => room.setInReception(e.target.checked)}
          className="accent-[#3FD17F]"
        />
        Recepção (antes de começar)
      </label>
    </div>
  );
}

/** The proposal alone, against the simulated room. */
function ProposalLab() {
  const room = useRoomSim();
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">Design Playground</p>
          <h1 className="font-display font-bold text-2xl text-foreground mt-1">Live Sidebar — proposta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sidebar do professor para atividades ao vivo, realinhado ao Brand System. Use os controles para
            simular a sala respondendo.
          </p>
        </div>
        <LabControls room={room} />
        <div className="flex justify-center pt-2">
          <ProposedSidebar
            sim={room.sim}
            onPrev={() => room.goTo(-1)}
            onNext={() => room.goTo(1)}
            onBegin={() => room.setInReception(false)}
            onToggleTimer={room.toggleTimer}
          />
        </div>
      </div>
    </div>
  );
}

/** Current production sidebar × the proposal, same simulated state. */
function CompareLab() {
  const room = useRoomSim();
  const { sim } = room;
  const answeredCount = sim.answerers.filter((a) => a.state !== 'pending').length;
  // O InstructorControls de produção ganhou o "revelar resposta" — sem este
  // estado (e sem os callbacks abaixo) o painel "Atual" renderizava o recurso
  // pela metade e o "+tempo" chamava um handler undefined.
  const [revealed, setRevealed] = useState(false);
  const [selfStaged, setSelfStaged] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  // O painel "Atual" tem que ser o componente de produção de VERDADE, senão a
  // comparação mente. Então as linhas saem do mesmo `buildLiveRoomRows` que a
  // aula usa, e não de um fixture paralelo que envelheceria sozinho.
  const rows = useMemo(
    () =>
      buildLiveRoomRows({
        ranking: sim.ranking,
        answerers: sim.answerers,
        roster: sim.roster,
        selfUserId: 'prof',
      }),
    [sim.ranking, sim.answerers, sim.roster],
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">Design Playground</p>
          <h1 className="font-display font-bold text-2xl text-foreground mt-1">Live Sidebar — antes × depois</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mesmo estado simulado nos dois painéis: o componente de produção à esquerda, a proposta à direita.
          </p>
        </div>
        <LabControls room={room} />

        <div className="flex flex-wrap justify-center gap-8 pt-2 items-start">
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-center">Atual</p>
            {/* Neutralize the production aside's page-level chrome (sticky/h-dvh/top-padding). */}
            <div className="w-[340px] rounded-3xl border border-border overflow-hidden [&>aside]:!pt-0 [&>aside]:lg:!h-auto [&>aside]:lg:!static [&>aside]:border-0">
              <LiveSidebar
                role="instructor"
                roster={sim.roster}
                answerers={sim.answerers}
                rows={rows}
                hasActivity={!sim.inReception}
                activityIndex={sim.activityIndex}
                activityCount={ACTIVITY_COUNT}
                onCopyLink={() => {}}
                onEnd={() => {}}
                controls={
                  <InstructorControls
                    inReception={sim.inReception}
                    answeredCount={answeredCount}
                    presentCount={sim.answerers.length}
                    busy={false}
                    canPrev={sim.activityIndex > 0}
                    canNext={sim.activityIndex < ACTIVITY_COUNT - 1}
                    timerRunning={sim.timer.running}
                    timerSeconds={sim.timer.total}
                    revealed={revealed}
                    canReveal
                    onBegin={() => room.setInReception(false)}
                    onPrev={() => room.goTo(-1)}
                    onNext={() => room.goTo(1)}
                    onStartTimer={() => room.toggleTimer()}
                    onStopTimer={() => room.toggleTimer()}
                    onAdjustTime={room.addTime}
                    onSetTime={() => {}}
                    onReveal={() => setRevealed(true)}
                    selfStaged={selfStaged}
                    onToggleSelfStage={() => setSelfStaged((v) => !v)}
                    onBreak={onBreak}
                    onToggleBreak={() => setOnBreak((v) => !v)}
                    onResetLesson={() => {}}
                  />
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-evergreen-hi text-center">Proposta</p>
            <ProposedSidebar
              sim={sim}
              onPrev={() => room.goTo(-1)}
              onNext={() => room.goTo(1)}
              onBegin={() => room.setInReception(false)}
              onToggleTimer={room.toggleTimer}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ v3 — Sala ao vivo ═══════════════════════════
 *
 * Três mudanças estruturais sobre a v2:
 *
 * 1. UMA lista, não três. A v2 herdou de produção a repetição dos MESMOS alunos
 *    em "Na sala", "Responderam" e "Ranking" — 3 varreduras para responder
 *    "como está o fulano?". A v3 funde tudo em UMA seção onde cada aluno é uma
 *    linha só, carregando presença + estado + tempo + posição ao mesmo tempo.
 *
 * 2. Ordem dinâmica (Duolingo). A lista se reordena ao vivo conforme as
 *    respostas chegam: acertos por velocidade no topo, depois erros, depois
 *    quem ainda pensa. A reposição é animada (framer-motion `layout`), então o
 *    professor VÊ a corrida acontecer em vez de reler números.
 *
 * 3. Altura sob controle. Só a lista rola; fluxo e ações ficam fixos. Com as
 *    duas seções redundantes fora, sobra orçamento para espaço negativo — o
 *    painel respira MAIS e mesmo assim cabe num notebook de 800px.
 */

/** Larguras por classe de tela. No app isto vira media query; aqui é derivado
 *  da largura do frame para o lab conseguir simular device por device. */
function sidebarWidthFor(frameWidth: number): number {
  if (frameWidth >= 1440) return 380;
  if (frameWidth >= 1280) return 348;
  if (frameWidth >= 1024) return 320;
  return 300;
}

/** Telas baixas (notebook 13", tablet paisagem) ganham densidade maior:
 *  paddings e linhas encolhem para o painel caber sem rolagem de página.
 *  Em produção: `@media (max-height: 820px)`. */
function isCompactHeight(frameHeight: number): boolean {
  return frameHeight <= 820;
}

interface RoomRow {
  userId: string;
  name: string;
  avatarUrl?: string;
  state: ClassAnswerer['state'];
  elapsedMs?: number;
  /** Posição na corrida — só quem acertou disputa ranking. */
  rank?: number;
}

/** Ações que o professor tem sobre um aluno, a partir do menu da linha. */
interface RowActions {
  onToggleStage: (userId: string) => void;
  onRemove: (userId: string) => void;
}

/**
 * A ordenação que faz a lista "viver": acertos por velocidade, depois erros
 * (também por velocidade), depois quem ainda está pensando. É a mesma regra do
 * ranking da v2 — só que agora ela ORDENA a lista única em vez de gerar uma
 * terceira seção.
 */
function rankRoom(answerers: ClassAnswerer[]): RoomRow[] {
  const bucket = (s: ClassAnswerer['state']) => (s === 'done' ? 0 : s === 'wrong' ? 1 : 2);
  const sorted = [...answerers].sort((x, y) => {
    const b = bucket(x.state) - bucket(y.state);
    if (b !== 0) return b;
    if (x.state === 'pending') return x.name.localeCompare(y.name);
    return (x.elapsedMs ?? 0) - (y.elapsedMs ?? 0);
  });

  let podium = 0;
  return sorted.map((a) => {
    const row: RoomRow = { userId: a.userId, name: a.name, avatarUrl: a.avatarUrl, state: a.state, elapsedMs: a.elapsedMs };
    if (a.state === 'done') {
      podium += 1;
      row.rank = podium;
    }
    return row;
  });
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Uma linha da sala: posição · avatar · nome · tempo · estado.
 *
 * Três estados, um de cada vez na MESMA linha (nada de popover: a lista rola
 * com `overflow-y-auto`, que recortaria qualquer menu posicionado por cima):
 *
 *   idle       → hover/foco revela o "⋯" no lugar do tempo+estado
 *   actions    → palco · Mais, com o nome à esquerda
 *   confirming → só a remoção pede confirmação (não tem desfazer ao vivo)
 *
 * Em telas sem hover (tablet) o "⋯" fica sempre visível — senão as ações
 * seriam inalcançáveis por toque.
 *
 * Tirar da aula mora atrás do "Mais": ao lado do botão de palco, o professor da
 * primeira aula com alunos reais confundiu os dois — "tirar da sala" e "tirar do
 * palco" são a mesma frase até a última palavra, e uma delas expulsa um
 * adolescente. O palco se usa toda hora, a remoção quase nunca.
 */
function RoomRowItem({
  row,
  compact,
  onStage,
  actions,
}: {
  row: RoomRow;
  compact: boolean;
  onStage: boolean;
  actions?: RowActions;
}) {
  const done = row.state === 'done';
  const wrong = row.state === 'wrong';
  const [mode, setMode] = useState<'idle' | 'actions' | 'confirming'>('idle');
  const confirming = mode === 'confirming';
  const [removeOpen, setRemoveOpen] = useState(false);

  const iconBtn =
    'w-8 h-8 shrink-0 grid place-items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1';

  return (
    <motion.li
      layout
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      /* Gap menor no modo de ações: com os controles enfileirados numa sidebar de
         300px, o gap-3 espremia o nome a ~20px e a barra virava anônima. */
      className={`group relative flex items-center rounded-xl ${mode === 'actions' ? 'gap-1.5' : 'gap-3'} ${
        compact ? 'py-1.5 px-2' : 'py-2 px-2.5'
      } ${
        confirming
          ? 'bg-destructive/10 ring-1 ring-destructive/30'
          : done
            ? 'bg-evergreen-soft/40'
            : wrong
              ? 'bg-destructive/5'
              : 'hover:bg-muted/40'
      }`}
      data-testid="room-row"
      data-state={row.state}
      data-rank={row.rank ?? ''}
      data-confirming={confirming ? 'true' : undefined}
    >
      {confirming ? (
        /* Confirmação inline — ocupa a linha inteira, sem modal. */
        <>
          <span className="flex-1 truncate text-sm text-foreground">
            Remover <strong className="font-medium">{row.name}</strong>?
          </span>
          <button
            onClick={() => actions?.onRemove(row.userId)}
            data-testid="row-remove-confirm"
            className="shrink-0 h-7 px-3 rounded-full bg-destructive/90 text-white text-xs font-medium hover:bg-destructive transition-colors"
          >
            Remover
          </button>
          <button
            onClick={() => setMode('actions')}
            data-testid="row-remove-cancel"
            className="shrink-0 h-7 px-2.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        </>
      ) : mode === 'actions' ? (
        /* Menu de ações — na própria linha, seguro contra o clip do scroll. */
        <>
          <LiveAvatar name={row.name} avatarUrl={row.avatarUrl} size="w-6 h-6" />
          <span className="flex-1 min-w-0 truncate text-sm text-foreground">{row.name.split(' ')[0]}</span>

          <button
            onClick={() => actions?.onToggleStage(row.userId)}
            aria-label={onStage ? `Tirar ${row.name} do palco` : `Chamar ${row.name} ao palco`}
            title={onStage ? 'Tirar do palco' : 'Chamar ao palco'}
            data-testid="row-stage"
            data-on-stage={onStage ? 'true' : 'false'}
            className={`${iconBtn} focus-visible:ring-streak/50 ${
              onStage
                ? 'border-streak bg-streak text-obsidiana hover:bg-streak/90'
                : 'border-streak/40 bg-streak/10 text-streak hover:bg-streak/20'
            }`}
          >
            <MonitorPlay className="w-4 h-4" />
          </button>

          {removeOpen ? (
            <button
              onClick={() => setMode('confirming')}
              aria-label={`Remover ${row.name} da aula`}
              title="Remover da aula"
              data-testid="row-remove"
              className={`${iconBtn} border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/50`}
            >
              <UserMinus className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setRemoveOpen(true)}
              aria-label={`Mais ações para ${row.name}`}
              title="Mais"
              data-testid="row-more"
              className="h-8 px-2 shrink-0 inline-flex items-center gap-1 rounded-full text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-evergreen/50"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Mais
            </button>
          )}

          <button
            onClick={() => {
              setMode('idle');
              setRemoveOpen(false);
            }}
            aria-label="Fechar ações"
            title="Fechar"
            data-testid="row-actions-close"
            className="w-7 h-8 shrink-0 grid place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          {/* Posição — medalha no pódio, número depois, "·" para quem não pontuou. */}
          <span
            className={`w-6 shrink-0 text-center font-mono tabular-nums ${
              row.rank && row.rank <= 3 ? 'text-base' : 'text-sm'
            } ${done ? 'text-evergreen-hi' : 'text-muted-foreground/50'}`}
          >
            {row.rank ? MEDALS[row.rank - 1] ?? row.rank : '·'}
          </span>

          <span className="relative shrink-0">
            <LiveAvatar name={row.name} avatarUrl={row.avatarUrl} size={compact ? 'w-6 h-6' : 'w-7 h-7'} />
            {onStage && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-streak ring-2 ring-card"
                aria-hidden
              />
            )}
          </span>

          <span className="flex-1 min-w-0 flex items-center gap-1.5">
            <span
              className={`truncate text-sm ${row.state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {row.name}
            </span>
          </span>

          {/* Slot de largura fixa: info e ação se alternam no MESMO espaço. */}
          <span className="relative shrink-0 h-6 w-[58px]">
            <span
              className={`absolute inset-0 flex items-center justify-end gap-2 transition-opacity ${
                actions ? 'group-hover:opacity-0 group-focus-within:opacity-0' : ''
              }`}
            >
              {typeof row.elapsedMs === 'number' && row.state !== 'pending' && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatMmss(Math.round(row.elapsedMs / 1000))}
                </span>
              )}
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-menta" />
              ) : wrong ? (
                <XCircle className="w-4 h-4 text-destructive/90" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
              )}
            </span>

            {actions && (
              <button
                onClick={() => setMode('actions')}
                aria-label={`Ações para ${row.name}`}
                aria-haspopup="true"
                title={`Ações para ${row.name}`}
                data-testid="row-actions-open"
                /* `[@media(hover:none)]` mantém o botão visível no toque — sem
                   isso as ações ficariam inalcançáveis no tablet. */
                className="absolute inset-y-0 right-0 w-7 grid place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:bg-muted group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-evergreen/50"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          </span>
        </>
      )}
    </motion.li>
  );
}

/**
 * Faixa do PALCO — aparece acima da "Sala ao vivo" só quando alguém foi chamado.
 *
 * Cor: token `streak` do design system (hsl(30 65% 66%), o "clay-leaning flame"
 * da paleta de gamificação). O brand proíbe âmbar cru e reserva clay para Q&A,
 * então `streak` é o único quente legítimo — e aqui ele marca um estado de
 * gamificação/atenção, não um rótulo de Q&A.
 */
function PalcoBanner({
  names,
  compact,
  onRemoveFromStage,
}: {
  names: { userId: string; name: string }[];
  compact: boolean;
  onRemoveFromStage: (userId: string) => void;
}) {
  if (names.length === 0) return null;

  return (
    /* Entrada por CSS (`animate-fade-in` do tailwind.config), NÃO por animação
       de `height` do framer-motion: uma animação de altura que congela no meio
       — o browser pausa rAF em aba/painel oculto — deixa o banner com 1px e ele
       NÃO se recupera, escondendo que existe alguém no palco. Estado crítico
       não pode depender de animação para ficar visível. */
    <div
      className="shrink-0 border-b border-streak/30 bg-streak/10 animate-fade-in"
      data-testid="palco-banner"
    >
      <div className={compact ? 'px-4 py-2' : 'px-5 py-3'}>
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2" aria-hidden>
            <span className="absolute inline-flex w-full h-full rounded-full bg-streak opacity-70 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-streak" />
          </span>
          <MonitorPlay className="w-4 h-4 text-streak shrink-0" />
          <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-streak leading-none">
            No palco
          </h3>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-streak/80">ao vivo</span>
        </div>

        {/* Teto de altura: o palco é um indicador de estado, não pode competir
            com a lista da sala se o professor chamar meia turma. */}
        <ul className={`mt-1.5 space-y-0.5 max-h-[92px] overflow-y-auto ${compact ? '' : 'space-y-1'}`}>
          {names.map((n) => (
            <li key={n.userId} className="flex items-center gap-2 text-sm text-foreground">
              <LiveAvatar name={n.name} avatarUrl={null} size={compact ? 'w-5 h-5' : 'w-6 h-6'} />
              <span className="flex-1 truncate">{n.name}</span>
              <button
                onClick={() => onRemoveFromStage(n.userId)}
                aria-label={`Tirar ${n.name} do palco`}
                title="Tirar do palco"
                data-testid="palco-remove"
                className="shrink-0 w-6 h-6 grid place-items-center rounded-full text-streak/70 hover:text-streak hover:bg-streak/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>

        {/* Copy explicativo só onde sobra altura — em tela baixa ele custaria
            uma linha inteira da sala. Sem possessivo: "a atividade dele/dela"
            presumiria o gênero de quem está no palco a partir do nome. */}
        {!compact && (
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
            {names.length > 1 ? 'As atividades aparecem' : 'A atividade aparece'} no palco, com
            acompanhamento em tempo real.
          </p>
        )}
      </div>
    </div>
  );
}

/** A seção única: cabeçalho com o pulso da sala + a lista viva (única região
 *  rolável do painel). */
function SalaAoVivo({
  answerers,
  instructors,
  compact,
  onStage,
  actions,
}: {
  answerers: ClassAnswerer[];
  instructors: ClassPresenceMember[];
  compact: boolean;
  onStage: string[];
  actions?: RowActions;
}) {
  const rows = useMemo(() => rankRoom(answerers), [answerers]);
  const answered = answerers.filter((a) => a.state !== 'pending').length;
  const total = answerers.length;
  const pct = total > 0 ? (answered / total) * 100 : 0;

  return (
    <section className={`flex-1 min-h-0 flex flex-col ${compact ? 'p-4' : 'p-5'}`} data-testid="sala-ao-vivo">
      <div className={compact ? 'mb-3' : 'mb-4'}>
        <SectionTitle icon={Users} title="Sala ao vivo" right={<CountBadge>{total}</CountBadge>} />

        {/* Pulso da sala: uma linha resolve "quantos já responderam". */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
            <div
              className="h-full rounded-full bg-evergreen transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
            {answered}/{total} responderam
          </span>
        </div>

        {instructors.length > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-evergreen" aria-hidden />
            {instructors.map((i) => i.name).join(' · ')} · você
          </p>
        )}
      </div>

      {/* Única região rolável do painel — é aqui que a escala (30 alunos) mora. */}
      <ul className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-0.5" data-testid="sala-lista">
        {rows.length === 0 ? (
          <li className="text-sm text-muted-foreground py-2">Ninguém na sala ainda.</li>
        ) : (
          rows.map((r) => (
            <RoomRowItem
              key={r.userId}
              row={r}
              compact={compact}
              onStage={onStage.includes(r.userId)}
              actions={actions}
            />
          ))
        )}
      </ul>
    </section>
  );
}

/* ───────────────────────────── Pódio de fim de aula ─────────────────────── */

/** Alturas do pedestal por colocação — a hierarquia é lida antes do texto. */
const PEDESTAL_H = [72, 52, 38];
/** Intensidade do evergreen por colocação. O brand reserva clay para Q&A e não
 *  tem ouro/prata/bronze — então a hierarquia vem da INTENSIDADE do verde, e o
 *  emoji da medalha entrega a leitura metálica. */
const PEDESTAL_BG = ['bg-evergreen', 'bg-evergreen/45', 'bg-evergreen/25'];

/** Ordem visual do pódio: 2º à esquerda, 1º no centro, 3º à direita. */
const PODIUM_ORDER = [1, 0, 2];

function Podium({ entries, compact }: { entries: PodiumEntry[]; compact: boolean }) {
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <section className={`flex-1 min-h-0 flex flex-col ${compact ? 'p-4' : 'p-5'}`} data-testid="podium">
      <div className="text-center shrink-0">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-evergreen/30 bg-evergreen-soft font-mono text-[10px] uppercase tracking-wider text-evergreen-hi">
          <PartyPopper className="w-3.5 h-3.5" /> Aula encerrada
        </span>
        <h3 className={`font-display font-bold uppercase tracking-wide text-foreground ${compact ? 'text-lg mt-2' : 'text-xl mt-2.5'}`}>
          Pódio da turma
        </h3>
      </div>

      {top3.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center mt-6">
          Ninguém respondeu nesta aula — sem pódio desta vez.
        </p>
      ) : (
        <>
          {/* Pedestais: 2º · 1º · 3º, subindo com stagger. */}
          <div className={`shrink-0 flex items-end justify-center gap-2 ${compact ? 'mt-4' : 'mt-6'}`}>
            {PODIUM_ORDER.map((idx) => {
              const e = top3[idx];
              if (!e) return null;
              return (
                /* Sobe com opacidade + deslocamento. NÃO animar `height` aqui:
                   com height 0→auto a linha inteira fica sem altura e a lista
                   de baixo passa por cima dos pedestais. */
                <motion.div
                  key={e.userId}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 * (2 - idx), type: 'spring', stiffness: 220, damping: 26 }}
                  className="flex-1 min-w-0 flex flex-col items-center"
                  data-testid="podium-step"
                  data-rank={e.rank}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {MEDALS[idx]}
                  </span>
                  <LiveAvatar name={e.name} avatarUrl={null} size={idx === 0 ? 'w-10 h-10' : 'w-8 h-8'} />
                  <span className="mt-1.5 w-full truncate text-center text-xs text-foreground" title={e.name}>
                    {e.name.split(' ')[0]}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {e.correct}/{e.answered} · {formatMmss(Math.round(e.totalMs / 1000))}
                  </span>
                  <div
                    style={{ height: PEDESTAL_H[idx] }}
                    className={`mt-1.5 w-full rounded-t-xl grid place-items-start justify-center pt-1.5 ${PEDESTAL_BG[idx]}`}
                  >
                    <span
                      className={`font-display font-bold text-lg ${idx === 0 ? 'text-obsidiana' : 'text-foreground/80'}`}
                    >
                      {e.rank}º
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Quem ficou fora do pódio — some se a turma tiver só 3. */}
          {rest.length > 0 && (
            <ul className="flex-1 min-h-0 overflow-y-auto mt-4 pt-3 border-t border-border space-y-0.5" data-testid="podium-rest">
              {rest.map((e) => (
                <li key={e.userId} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                  <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">
                    {e.rank}º
                  </span>
                  <LiveAvatar name={e.name} avatarUrl={null} size="w-6 h-6" />
                  <span className="flex-1 truncate text-foreground">{e.name}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
                    {e.correct}/{e.answered}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** O painel v3 completo — coluna de altura total: fluxo fixo, sala rolável,
 *  ações fixas no pé. */
function SidebarV3({
  sim,
  frameWidth,
  frameHeight,
  onPrev,
  onNext,
  onBegin,
  onToggleTimer,
  actions,
  onFinish,
  onResume,
}: {
  sim: RoomSim;
  frameWidth: number;
  frameHeight: number;
  onPrev: () => void;
  onNext: () => void;
  onBegin: () => void;
  onToggleTimer: () => void;
  actions?: RowActions;
  onFinish?: () => void;
  onResume?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const compact = isCompactHeight(frameHeight);
  const width = sidebarWidthFor(frameWidth);
  const instructors = sim.roster.filter((m) => m.isInstructor);
  // Nomes de quem está no palco, na ordem em que foram chamados.
  const stageMembers = sim.onStage
    .map((id) => {
      const m = sim.roster.find((r) => r.userId === id);
      return m ? { userId: id, name: m.name } : null;
    })
    .filter((m): m is { userId: string; name: string } => m !== null);

  // ── Aula encerrada: o painel inteiro vira o pódio ──
  if (sim.finished) {
    return (
      <aside
        style={{ width }}
        className="shrink-0 h-full border-l border-border bg-card flex flex-col"
        data-testid="sidebar-v3"
        data-finished="true"
        data-compact={compact ? 'true' : 'false'}
      >
        <Podium entries={sim.podium} compact={compact} />
        <div className={`shrink-0 border-t border-border ${compact ? 'p-3' : 'p-4'}`}>
          <button
            onClick={onResume}
            data-testid="podium-back"
            className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-evergreen/40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar à aula
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{ width }}
      className="shrink-0 h-full border-l border-border bg-card flex flex-col"
      data-testid="sidebar-v3"
      data-compact={compact ? 'true' : 'false'}
    >
      {/* ── Fluxo (fixo) ── */}
      <div className={`shrink-0 border-b border-border ${compact ? 'p-4 space-y-3' : 'p-5 space-y-4'}`}>
        {sim.inReception ? (
          <button
            onClick={onBegin}
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-evergreen text-obsidiana font-display font-semibold text-[15px] uppercase tracking-wide hover:bg-evergreen-hi transition-colors"
          >
            <Play className="w-4 h-4" /> Começar aula
          </button>
        ) : (
          <>
            <FlowControlsV2
              activityIndex={sim.activityIndex}
              activityCount={ACTIVITY_COUNT}
              canPrev={sim.activityIndex > 0}
              canNext={sim.activityIndex < ACTIVITY_COUNT - 1}
              allAnswered={sim.allAnswered}
              onPrev={onPrev}
              onNext={onNext}
              isLast={sim.activityIndex === ACTIVITY_COUNT - 1}
              onFinish={onFinish}
            />
            <TimerPlayerV2
              running={sim.timer.running}
              total={sim.timer.total}
              remaining={sim.timer.remaining}
              onToggle={onToggleTimer}
            />
          </>
        )}
      </div>

      {/* ── Leitura pedagógica (fixa) ── */}
      {!sim.inReception && (
        <div className="shrink-0 border-b border-border">
          <ActivityStatsCompact
            answerers={sim.answerers}
            compact={compact}
            hideInsight={compact && stageMembers.length > 0}
          />
        </div>
      )}

      {/* ── Palco (só existe quando alguém foi chamado) ── */}
      {!sim.inReception && actions && (
        <PalcoBanner
          names={stageMembers}
          compact={compact}
          onRemoveFromStage={actions.onToggleStage}
        />
      )}

      {/* ── Sala ao vivo (rola) ── */}
      <SalaAoVivo
        answerers={sim.answerers}
        instructors={instructors}
        compact={compact}
        onStage={sim.onStage}
        actions={actions}
      />

      {/* ── Ações (fixas) ──
          Em tela baixa as duas ações dividem UMA linha (o "encerrar" vira
          ícone): devolve ~45px de altura para a lista, que é onde a informação
          viva mora. Em tela alta elas ficam empilhadas e rotuladas. */}
      <div className={`shrink-0 border-t border-border ${compact ? 'p-3' : 'p-4'}`}>
        <div className={compact ? 'flex items-center gap-2' : 'space-y-2'}>
          <button
            onClick={() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            data-testid="v3-copy-link"
            className={`inline-flex items-center justify-center gap-2 h-10 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-evergreen/40 transition-colors ${
              compact ? 'flex-1 min-w-0' : 'w-full'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-menta" /> Link copiado
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 shrink-0" />
                <span className="truncate">{compact ? 'Copiar link' : 'Copiar link de entrada'}</span>
              </>
            )}
          </button>
          <button
            onClick={onFinish}
            aria-label="Encerrar aula"
            title="Encerrar aula"
            data-testid="v3-end"
            className={`inline-flex items-center justify-center gap-1.5 rounded-full font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors ${
              compact ? 'w-10 h-10 shrink-0 border border-destructive/30' : 'w-full h-9 text-sm'
            }`}
          >
            <Square className="w-3 h-3" />
            {!compact && 'Encerrar aula'}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Stats da atividade em faixa compacta — os 3 números + a leitura pedagógica,
 *  sem os cards altos da v2 (o orçamento de altura foi para a sala). */
function ActivityStatsCompact({
  answerers,
  compact,
  hideInsight = false,
}: {
  answerers: ClassAnswerer[];
  compact: boolean;
  /** Em tela baixa COM alguém no palco, a leitura pedagógica cede a vez: a
   *  atenção do professor está no palco, e essas ~40px viram linhas da sala. */
  hideInsight?: boolean;
}) {
  const total = answerers.length;
  const correct = answerers.filter((a) => a.state === 'done').length;
  const wrong = answerers.filter((a) => a.state === 'wrong').length;
  const pending = total - correct - wrong;
  const insight = insightLine(correct, wrong, pending, total);

  const stats = [
    { key: 'correct', value: correct, label: 'Acertaram', cls: 'text-menta' },
    { key: 'wrong', value: wrong, label: 'Erraram', cls: 'text-destructive' },
    { key: 'waiting', value: pending, label: 'Aguardando', cls: 'text-muted-foreground' },
  ];

  return (
    <div className={compact ? 'p-4' : 'p-5'} data-testid="stats-v3">
      <SectionTitle
        icon={LayoutGrid}
        title="Atividade"
        right={
          <span className="inline-flex items-center px-2 h-5 rounded-full bg-evergreen-soft font-mono text-[10px] uppercase tracking-wider text-evergreen-hi">
            multi choice
          </span>
        }
      />
      <div className="flex items-stretch">
        {stats.map((s, i) => (
          <div key={s.key} className={`flex-1 text-center ${i > 0 ? 'border-l border-border/70' : ''}`}>
            <p className={`font-mono text-2xl tabular-nums leading-none ${s.value > 0 ? s.cls : 'text-muted-foreground/50'}`}>
              {s.value}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>
      {insight && !hideInsight && (
        <p
          className={`flex items-start gap-2 rounded-xl bg-evergreen-soft/60 px-3 text-xs text-foreground/90 ${
            compact ? 'mt-2.5 py-1.5' : 'mt-3.5 py-2'
          }`}
        >
          <Lightbulb className="w-3.5 h-3.5 text-evergreen-hi shrink-0 mt-px" />
          {insight}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────── Frame de device para o lab ─────────────────────── */

interface Device {
  id: string;
  label: string;
  w: number;
  h: number;
}

/** Alturas são de VIEWPORT útil (já descontado o chrome do browser). */
const DEVICES: Device[] = [
  { id: 'nb13', label: 'Notebook 13"', w: 1280, h: 720 },
  { id: 'nb15', label: 'Notebook 15"', w: 1440, h: 815 },
  { id: 'tabL', label: 'Tablet paisagem', w: 1024, h: 700 },
  { id: 'tabP', label: 'Tablet retrato', w: 834, h: 1000 },
  { id: 'desk', label: 'Desktop', w: 1920, h: 950 },
];

/** Renderiza o painel dentro de um viewport de device real, escalado para caber
 *  no canvas do Storybook. É o que torna o problema de ALTURA visível. */
function DeviceFrame({ device, children }: { device: Device; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Ignore zero-width reads: the first paint inside the Storybook iframe can
    // report 0 and would lock the frame at scale(0) forever (the wrapper is
    // w-full, so collapsing the content never re-triggers the observer).
    // Piso de 55%: abaixo disso o painel fica ilegível (acontece quando o
    // canvas do Storybook divide espaço com a barra de addons) — melhor rolar
    // na horizontal do que encolher até não dar para avaliar o design.
    const measure = () => {
      const available = el.clientWidth || el.parentElement?.clientWidth || 0;
      if (available > 0) setScale(Math.max(0.55, Math.min(1, available / device.w)));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [device.w]);

  return (
    <div ref={wrapRef} className="w-full overflow-x-auto">
      <div style={{ height: device.h * scale, width: device.w * scale }}>
        <div
          style={{
            width: device.w,
            height: device.h,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          className="flex rounded-2xl border border-border overflow-hidden bg-background"
          data-testid="device-frame"
        >
          {children}
        </div>
      </div>
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {device.label} · {device.w}×{device.h} · escala {Math.round(scale * 100)}%
      </p>
    </div>
  );
}

/** Palco fake à esquerda — existe para mostrar quanto da tela o painel ocupa. */
function StagePlaceholder() {
  return (
    <div className="flex-1 min-w-0 grid place-items-center p-8">
      <div className="w-full max-w-xl space-y-4 opacity-40">
        <div className="h-3 w-28 rounded-full bg-muted" />
        <div className="h-8 w-3/4 rounded-lg bg-muted" />
        <div className="rounded-2xl border border-border p-6 space-y-3">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
          <div className="h-11 w-full rounded-xl bg-muted mt-6" />
          <div className="h-11 w-full rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

/** Story v3: painel novo dentro de um device selecionável. */
function ResponsiveLab() {
  const room = useRoomSim();
  const [deviceId, setDeviceId] = useState(DEVICES[0].id);
  const device = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">Design Playground</p>
          <h1 className="font-display font-bold text-2xl text-foreground mt-1">Live Sidebar — v3 · Sala ao vivo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uma seção só no lugar de três, ordem dinâmica conforme as respostas chegam, e altura que cabe no
            device. Passe o mouse sobre um aluno e abra o "⋯" para dar uma estrela, chamar ao palco ou
            removê-lo. Encerre (ou conclua a última atividade) para ver o pódio.
          </p>
        </div>

        <LabControls room={room} />

        {/* Seletor de device */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Device</span>
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDeviceId(d.id)}
              data-testid={`device-${d.id}`}
              className={`inline-flex items-center h-9 px-3.5 rounded-full border text-sm transition-colors ${
                d.id === deviceId
                  ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
                  : 'border-border bg-card text-foreground hover:border-evergreen/40'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <DeviceFrame device={device}>
          <StagePlaceholder />
          <SidebarV3
            sim={room.sim}
            frameWidth={device.w}
            frameHeight={device.h}
            onPrev={() => room.goTo(-1)}
            onNext={() => room.goTo(1)}
            onBegin={() => room.setInReception(false)}
            onToggleTimer={room.toggleTimer}
            actions={{
              onToggleStage: room.toggleStage,
              onRemove: room.removeStudent,
            }}
            onFinish={room.finish}
            onResume={room.resume}
          />
        </DeviceFrame>
      </div>
    </div>
  );
}

/* ────────────────────────────────── Meta ─────────────────────────────────── */

const meta: Meta = {
  title: 'Design Playground/Live Sidebar Lab',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
};
export default meta;

export const Proposta: StoryObj = {
  render: () => <ProposalLab />,
};

export const AntesEDepois: StoryObj = {
  name: 'Antes × Depois',
  render: () => <CompareLab />,
};

export const SalaAoVivoV3: StoryObj = {
  name: 'v3 · Sala ao vivo (responsivo)',
  render: () => <ResponsiveLab />,
};
