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
 * Playground-only code (src/stories/): the proposal does NOT touch the
 * production components; approve here first, then port.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
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
} from 'lucide-react';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { InstructorControls } from '@/components/live/InstructorControls';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { formatMmss } from '@/utils/formatMmss';
import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';

/* ─────────────────────────────── Simulation ─────────────────────────────── */

const PROF: ClassPresenceMember = { userId: 'prof', name: 'Prof. Tainan', isInstructor: true };
const INITIAL_STUDENTS = ['Ana Souza', 'Bruno Lima', 'Caio Mendes', 'Duda Rocha'];
const EXTRA_STUDENTS = ['Elisa Prado', 'Felipe Nunes', 'Gabi Torres', 'Hugo Reis', 'Iara Melo'];

const TIMER_TOTAL = 60;
const ACTIVITY_COUNT = 5;

interface RoomSim {
  inReception: boolean;
  activityIndex: number;
  roster: ClassPresenceMember[];
  answerers: ClassAnswerer[];
  ranking: ClassRanking;
  timer: { running: boolean; total: number; remaining: number };
  allAnswered: boolean;
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
}: {
  activityIndex: number;
  activityCount: number;
  canPrev: boolean;
  canNext: boolean;
  allAnswered: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
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
          onClick={onNext}
          disabled={!canNext}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full bg-evergreen text-obsidiana font-display font-semibold text-[15px] uppercase tracking-wide hover:bg-evergreen-hi transition-all disabled:opacity-35 ${
            allAnswered && canNext ? 'ring-2 ring-evergreen-hi/70 ring-offset-2 ring-offset-card' : ''
          }`}
        >
          Próxima <ChevronRight className="w-4 h-4" />
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

function useRoomSim() {
  const [inReception, setInReception] = useState(false);
  const [activityIndex, setActivityIndex] = useState(3);
  const [students, setStudents] = useState<string[]>(INITIAL_STUDENTS);
  const [answers, setAnswers] = useState<Map<string, { state: 'done' | 'wrong'; elapsedMs: number }>>(new Map());
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

  const roster: ClassPresenceMember[] = useMemo(
    () => [PROF, ...students.map((name, i) => ({ userId: `s-${i}`, name, isInstructor: false }))],
    [students],
  );

  const answerers: ClassAnswerer[] = useMemo(
    () =>
      students.map((name, i) => {
        const a = answers.get(`s-${i}`);
        return a
          ? { userId: `s-${i}`, name, state: a.state, elapsedMs: a.elapsedMs }
          : { userId: `s-${i}`, name, state: 'pending' as const };
      }),
    [students, answers],
  );

  const ranking = useMemo(() => buildRanking(answerers), [answerers]);
  const allAnswered = answerers.length > 0 && answerers.every((a) => a.state !== 'pending');

  function simulateAnswer(correct: boolean) {
    const next = answerers.find((a) => a.state === 'pending');
    if (!next) return;
    setAnswers((prev) =>
      new Map(prev).set(next.userId, {
        state: correct ? 'done' : 'wrong',
        elapsedMs: 4000 + Math.round(Math.random() * 36000),
      }),
    );
  }

  function resetAnswers() {
    setAnswers(new Map());
  }

  function goTo(delta: -1 | 1) {
    setActivityIndex((i) => Math.max(0, Math.min(ACTIVITY_COUNT - 1, i + delta)));
    resetAnswers();
    setTimerRunning(false);
    setRemaining(TIMER_TOTAL);
  }

  function addStudent() {
    setStudents((prev) =>
      prev.length - INITIAL_STUDENTS.length < EXTRA_STUDENTS.length
        ? [...prev, EXTRA_STUDENTS[(extraSeq++) % EXTRA_STUDENTS.length]]
        : prev,
    );
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

  const sim: RoomSim = {
    inReception,
    activityIndex,
    roster,
    answerers,
    ranking,
    timer: { running: timerRunning, total: TIMER_TOTAL, remaining },
    allAnswered,
  };

  return {
    sim,
    simulateAnswer,
    resetAnswers,
    addStudent,
    toggleTimer,
    setInReception,
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
                selfUserId="prof"
                hasActivity={!sim.inReception}
                activityIndex={sim.activityIndex}
                activityCount={ACTIVITY_COUNT}
                kind="multi_choice"
                ranking={sim.ranking}
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
                    onBegin={() => room.setInReception(false)}
                    onPrev={() => room.goTo(-1)}
                    onNext={() => room.goTo(1)}
                    onStartTimer={() => room.toggleTimer()}
                    onStopTimer={() => room.toggleTimer()}
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
