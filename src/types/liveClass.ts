import type { RecordedAction } from '@/utils/learningTrace';
import type { ActivityChatScreen, ActivityTerminalScreen } from '@iterahq/activities';
import type { StageCursorPlan } from '@/utils/stageCursorRate';
import type { AnnotationFrame, AnnotationStroke } from '@/types/liveAnnotation';

export type ClassSessionStatus = 'pending' | 'live' | 'ended';
export type ClassScope = 'global' | 'tenant';

/** The durable/reconnect truth for a live cohort class (itera.class_sessions). */
export interface ClassSession {
  id: string;
  tenantId: string;
  lessonId: string;
  instructorId: string;
  currentActivityId: string | null;
  status: ClassSessionStatus;
  scope: ClassScope;
  podiumEvery: number | null;
  /**
   * The professor chose, at class creation, that a timed exercise stays INERT
   * until he starts the clock (migration 0057). `false` = today's behaviour: the
   * activity is answerable the moment it lands on screen.
   */
  timerGated: boolean;
  /** Intended start time for a scheduled (pending) class; null when started immediately. */
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

/** Identity a client tracks into presence (self). */
export interface ClassIdentity {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  isInstructor?: boolean;
  /**
   * Link-invited guest (plan 20260728-…, ADR-9/ADR-11). Rides in the presence
   * payload so the whole room can badge the row — names are self-declared and
   * may collide with a real student's, and the badge is what carries the
   * distinction. The DURABLE truth is `itera.class_guests` (instructor-readable);
   * presence is the live, best-effort mirror of it.
   */
  isGuest?: boolean;
}

export interface ClassPresenceMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isInstructor: boolean;
  /** Link-invited guest — badged everywhere they appear (ADR-9). */
  isGuest?: boolean;
  /** The learner currently has their hand raised (presence-tracked). */
  handRaised?: boolean;
  /**
   * Activity the learner already has local work for (presence-tracked). Lets the
   * professor's stage picker tell "em andamento" apart from "não começou" BEFORE
   * pulling, instead of choosing blind. Null/absent = no work yet (or a client on
   * the previous build, which never tracks it).
   */
  workingOn?: string | null;
}

export interface ClassCompleter {
  userId: string;
  name: string;
  avatarUrl: string | null;
  done: boolean;
}

export type ClassAnswerState = 'pending' | 'wrong' | 'done';

export interface ClassAnswerer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  state: ClassAnswerState;
  /** How long the learner took to answer this activity, in ms (when known). */
  elapsedMs?: number;
}

export interface ClassTimer {
  activityId: string;
  deadline: number;
}

/** Author of a staged answer (shown on the identity bar — NOT anonymous). */
export interface StagedAuthor {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * How far along the staged work is. `in_progress` is a DRAFT — the stage must
 * label it, otherwise the class reads a classmate's half-written attempt as a
 * final answer (pedagogically the worst outcome of pulling WIP).
 */
export type StageWorkStatus = 'submitted' | 'in_progress' | 'not_started';

/** What a learner replies with on `stage-request` (see utils/stageAnswerContent). */
export interface StageContent {
  /** `code` | `terminal` | `chat` | `answer` | `empty` (nothing local yet). */
  kind: string;
  content: string;
  status: StageWorkStatus;
  /** O texto da resposta do aluno — ver `StoredLiveAnswer.response`. */
  response?: string;
  /**
   * A tela do `terminal_sandbox` do aluno, quando é ela que está sendo puxada.
   *
   * Campo PRÓPRIO, e não `content` serializado, porque um cliente de build
   * anterior lê `kind` que não conhece e cai no estado vazio explicado; um JSON
   * enfiado em `content` renderizaria como texto no palco da turma. É a mesma
   * regra de compatibilidade que fez `response` nascer ao lado de `content` em
   * vez de dentro dele.
   */
  terminal?: StageTerminalScreen;
  /**
   * A conversa do `chat_sandbox` do aluno, quando é ela que está sendo puxada.
   *
   * Campo PRÓPRIO pela mesma regra de compatibilidade do `terminal`: um cliente
   * de build anterior lê um `kind` que não conhece e cai no estado vazio
   * explicado, em vez de renderizar JSON no projetor.
   */
  chat?: StageChatScreen;
}

/**
 * A tela de terminal que viaja no palco. Alias do contrato do pacote: quem
 * DESENHA é o `TerminalScreenMirror` de `@iterahq/activities`, então o app não
 * pode ter uma segunda definição — as duas divergiriam exatamente onde as duas
 * imagens precisam bater.
 */
export type StageTerminalScreen = ActivityTerminalScreen;

/**
 * A conversa de chat que viaja no palco. Alias pelo MESMO motivo do de cima:
 * quem DESENHA é o `ChatScreenMirror` de `@iterahq/activities`.
 *
 * ⚠️ Só os turnos ENVIADOS. O rascunho não-enviado do compositor não entra neste
 * tipo em lugar nenhum — a regra e o porquê estão em `ActivityChatScreen`.
 */
export type StageChatScreen = ActivityChatScreen;

/**
 * One row of the single "sala ao vivo" list (see utils/liveRoomRows): everything
 * the sidebar knows about one person, flattened so the row component only
 * renders. Order is the CUMULATIVE podium order; `state` is the CURRENT
 * activity.
 */
export interface LiveRoomRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Cumulative podium position; absent for a learner who hasn't answered yet. */
  rank?: number;
  state: ClassAnswerState;
  /**
   * Has local work for the current activity but hasn't submitted it. Presence
   * only — a learner on the previous build never tracks it and reads as false,
   * which degrades to the old information rather than to something wrong.
   */
  working: boolean;
  /** Time taken on the current activity, in ms (when known). */
  elapsedMs?: number;
  raised: boolean;
  /** Was in the room and dropped presence — the row stays, dimmed. */
  down: boolean;
  guest: boolean;
  isSelf: boolean;
  correctCount: number;
  answeredCount: number;
}

/** What the professor can do to a learner, regardless of the current activity. */
export interface LiveRoomModeration {
  /** Ask the learner's own client to lower the hand (presence is owner-write). */
  onLowerHand: (userId: string) => void;
  /** Move one `code` attempt on the current activity — lives are owner-write too. */
  onAdjustLife: (userId: string, delta: 1 | -1) => void;
  /** Remove from the room — durable, so a refresh does not bring them back. */
  onRemove: (userId: string) => void;
}

/** What the professor can do to one row. */
export interface LiveRoomRowActions extends LiveRoomModeration {
  /** Pull this learner's work onto the class stage — or take it off. */
  onToggleStage: (userId: string) => void;
  onStage: boolean;
  /** The pull is in flight (awaiting the learner's peer-to-peer reply). */
  pending: boolean;
  /** The pull timed out — the learner is offline and can never answer it. */
  unreachable: boolean;
}

/**
 * The work pulled to the class stage: `code` carries raw source, `terminal` and
 * `chat` carry the learner's screen, else a summary.
 */
export interface StagedAnswer {
  activityId: string;
  kind: string;
  content: string;
  /** Draft vs finished vs untouched — drives the "em andamento" badge. */
  status: StageWorkStatus;
  /** O texto da resposta do aluno — ver `StoredLiveAnswer.response`. */
  response?: string;
  /** A tela do terminal do aluno — só em `kind === 'terminal'`. */
  terminal?: StageTerminalScreen;
  /** A conversa do chat do aluno — só em `kind === 'chat'`. */
  chat?: StageChatScreen;
  author: StagedAuthor;
}

/** Monaco caret of the person on stage, 1-based — mirrored into the read-only twin. */
export interface StageCursorCaret {
  line: number;
  column: number;
}

/**
 * O que o CAPTURADOR local entrega ao transporte: um frame já normalizado, sem
 * a identidade nem o relógio, que quem envia acrescenta.
 */
export interface StageCursorFrame {
  x: number;
  y: number;
  paneW: number;
  paneH: number;
  visible: boolean;
  caret: StageCursorCaret | null;
  /** Este frame é um CLIQUE — ver `StageClick`. Só com captura de clique ligada. */
  click?: boolean;
}

/**
 * One frame of the on-stage cursor (plan 20260728-…, Fases 2/3).
 *
 * Coordinates are NORMALIZED 0..1 against the code editor pane, so anything
 * outside that pane is by construction never transmitted (ADR-4: one decision
 * covering both fidelity and privacy).
 *
 * ⚠️ Normalized is not enough on its own — the frame also carries the emitter's
 * pane size, and `utils/stageCursorPlacement` explains why.
 */
export interface StageCursor {
  activityId: string;
  /** Must equal `stagedAnswer.author.userId` or the frame is dropped (ADR-2/R5). */
  userId: string;
  /** 0..1 across the editor pane. */
  x: number;
  /** 0..1 down the editor pane. */
  y: number;
  /** The EMITTER's pane size in CSS px. Absent on a frame from an older client. */
  paneW?: number;
  paneH?: number;
  /** False = the pointer left the pane. Sent once, as an edge, not streamed. */
  visible: boolean;
  /** Where the person is actually typing; null when unknown. */
  caret: StageCursorCaret | null;
  /** Emitter clock (ms). Out-of-order frames are dropped. */
  t: number;
}

/**
 * Um CLIQUE sobre o painel, para o pulso que aparece e some (K1 — Samuel na
 * call de 06/08: "uma sinalização quando ele clica, que vai sumindo talvez?").
 *
 * Separado do `StageCursor` de propósito: o cursor é estado contínuo, que a
 * posição seguinte sobrescreve; o clique é EVENTO — dois cliques no mesmo ponto
 * são dois pulsos, e é o `t` que os distingue (ele é a chave de render do
 * pulso). Como campo do frame de cursor viraria "um pulso por posição", ou seja
 * quem clica duas vezes pra insistir veria um pulso só.
 */
export interface StageClick {
  /** 0..1 across the editor pane. */
  x: number;
  /** 0..1 down the editor pane. */
  y: number;
  /** Emitter clock (ms) — identidade do pulso, não só ordenação. */
  t: number;
}

/** The learner's own persisted answer for one activity (refresh protection). */
export interface StoredLiveAnswer {
  correct: boolean;
  elapsedMs: number;
  /**
   * O QUE o aluno respondeu, em texto (a alternativa, a ordem, os pares) — vem
   * do `detail.response` que a atividade já entrega. Sem ele o palco só sabia
   * dizer "respondeu", que é justamente a informação que o professor já tinha.
   */
  response?: string;
  /**
   * O veredito AUTORADO que a atividade entrega junto do booleano — o recap do
   * sandbox, o porquê do judge. Fica guardado com a resposta porque o footer do
   * ao-vivo continua na tela depois de um refresh, e um footer que reaparece sem
   * a frase é pior que um que nunca a teve: o aluno viu a explicação, recarregou
   * pra reler, e ela sumiu.
   */
  message?: string;
  explanation?: string;
  /**
   * What the learner PICKED, as the activity handed it up — only the actions a
   * restore reads (`restoreActions`). After a refresh the activity re-mounts,
   * and without this it came back blank beside its own verdict.
   */
  actions?: RecordedAction[];
}

/**
 * One learner's result for one activity, as it travels between clients — see
 * `src/utils/liveScoreboard.ts` for why the professor hands the whole board to
 * whoever joins.
 */
export interface ScoreboardEntry {
  activityId: string;
  userId: string;
  correct: boolean;
  /** Only ever set for a correct answer; the podium ranks on it. */
  elapsedMs?: number;
}

export interface ClassRankingEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Cumulative answer time across the activities the learner has answered, in ms. */
  totalMs: number;
  answeredCount: number;
  correctCount: number;
  /** 1-based position (most correct first, cumulative time breaks the tie). */
  rank: number;
  /** Link-invited guest — badged on the ranked list AND on the podium (ADR-9). */
  isGuest?: boolean;
}

export interface ClassRanking {
  ranked: ClassRankingEntry[];
  /** Present learners who have not answered anything yet (no timing to rank). */
  waiting: { userId: string; name: string; avatarUrl: string | null; isGuest?: boolean }[];
}

/* ── Post-class report (durable answers + attendance, migration 0020) ─────── */

export interface ClassAnswerRecord {
  activityId: string;
  userId: string;
  correct: boolean;
  elapsedMs: number | null;
  createdAt: string;
}

export interface ClassAttendanceRecord {
  userId: string;
  joinedAt: string;
}

export interface ClassReportUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** Raw per-session report inputs (service) — aggregated in TS by buildClassReport. */
export interface ClassReportData {
  answers: ClassAnswerRecord[];
  attendance: ClassAttendanceRecord[];
  users: ClassReportUser[];
  /**
   * The `itera.class_guests` user ids for this session — who was a link-invited
   * guest rather than a member of the cohort. Empty when the guest schema is not
   * applied yet, which the report treats as "no guests known" (it will then
   * count everyone, i.e. exactly the old behaviour).
   */
  guestUserIds?: string[];
}

export interface ClassReportParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  answeredCount: number;
  correctCount: number;
  totalMs: number;
  /** Link-invited guest — listed and badged, but excluded from `totals` (ADR-4). */
  isGuest?: boolean;
}

export interface ClassReportActivityStat {
  activityId: string;
  correct: number;
  wrong: number;
  unanswered: number;
}

export interface ClassReport {
  participants: ClassReportParticipant[];
  perActivity: ClassReportActivityStat[];
  /**
   * COHORT-ONLY figures. Guests are excluded from every number here; they are
   * counted separately in `guests` so the professor can see that a demo visitor
   * was present without that visitor moving the class's stats.
   */
  totals: { participants: number; answers: number; correctPct: number; guests: number };
}

/** Inputs to the learner-side interaction gate (see utils/liveActivityGate). */
export interface LearnerGateInput {
  /** A countdown is currently running for THIS activity. */
  timerRunning: boolean;
  /** The countdown for THIS activity has run out (or the professor stopped it). */
  expired: boolean;
  /** The learner already answered THIS activity. */
  answered: boolean;
  /**
   * The learner took that answer back to work on it again. Stays true until they
   * resubmit, so `answered` keeps meaning "there is a submitted answer of mine"
   * — which is what the expiry lock reads.
   */
  reopened?: boolean;
  /**
   * THIS activity has a countdown to be started (`liveTimerSeconds(kind, spec) > 0`).
   * Optional: absent means "unknown", which keeps the pre-start behaviour of every
   * call site that predates the flag.
   */
  timerConfigured?: boolean;
}

export interface LearnerGate {
  /** A countdown started (or already ran) for this activity. */
  started: boolean;
  /** Time ran out before the learner answered — inert + revealed. */
  locked: boolean;
  /** The countdown exists but the professor hasn't started it — inert, NOT revealed. */
  awaitingStart: boolean;
  /** The activity stage renders read-only (inert). */
  readOnly: boolean;
  /** A completion may be persisted/broadcast (never locked or already answered). */
  canComplete: boolean;
  /**
   * The learner may take their own submission back and work on it again. Says
   * nothing about the KIND — that is `canReopenSubmission`.
   */
  canReopen: boolean;
  /** They took it back and the round is still open — editing a second time. */
  editing: boolean;
}

export interface UseClassSession {
  session: ClassSession | null;
  currentActivityId: string | null;
  status: ClassSession['status'] | null;
  roster: ClassPresenceMember[];
  connected: boolean;
  /** A previously-joined channel dropped and is being rebuilt (show the banner). */
  reconnecting: boolean;
  loading: boolean;
  answers: Record<string, Record<string, boolean>>;
  /** Per activity → per learner: how long they took to answer, in ms. */
  elapsed: Record<string, Record<string, number>>;
  timer: ClassTimer | null;
  /** Activity whose timer the professor just stopped — reveal the answer. */
  stoppedFor: string | null;
  /** The work pulled to the stage right now (whole class sees it) — or null. */
  stagedAnswer: StagedAnswer | null;
  /** Instructor: learner whose pull is in flight (awaiting their reply) — or null. */
  stagePendingUserId: string | null;
  /** Instructor: learner whose pull timed out (offline / unreachable) — or null. */
  stageUnreachableUserId: string | null;
  broadcast: (activityId: string) => void;
  broadcastAnswer: (activityId: string, correct: boolean, elapsedMs?: number) => void;
  broadcastTimer: (activityId: string, durationSeconds: number) => void;
  clearTimer: (activityId: string) => void;
  /** This client was removed from the room — the realtime JOIN is denied now. */
  removed: boolean;
  /** Learner side: is my own hand up. Single source of truth (presence rides it). */
  handRaised: boolean;
  /** Re-track presence with the hand raised/lowered (learner side). */
  setHandRaised: (raised: boolean) => void;
  /**
   * A turma está em pausa para dúvidas. É sinalização, não trava: quem já estava
   * respondendo termina. Avançar de atividade retoma sozinho.
   */
  onBreak: boolean;
  /** Instructor: abre/fecha a pausa para dúvidas para a sala inteira. */
  setBreak: (on: boolean) => void;
  /**
   * O instante de corte de "resetar a lição para todos", ou `null` se esta aula
   * nunca foi resetada. Resposta anterior a ele não conta mais na agregação do
   * professor; no aluno, uma mudança aqui é o sinal para limpar o estado local.
   * Ver `utils/liveLessonReset.ts`.
   */
  lessonResetAt: string | null;
  /** Instructor: anuncia o corte para a sala inteira. */
  resetLesson: (at: string) => void;
  /** Instructor: ask a learner's own client to lower its hand (presence is owner-write). */
  lowerHand: (userId: string) => void;
  /** Instructor: move a learner's `code` attempts by one on the current activity. */
  adjustLife: (userId: string, delta: 1 | -1) => void;
  /** Instructor: remove a learner from the room. Resolves false if the write failed. */
  removeLearner: (userId: string) => Promise<boolean>;
  /** Re-track presence with the activity the learner has local work for (learner side). */
  setWorkingOn: (activityId: string | null) => void;
  /** Instructor: pull a learner's work for the current activity onto the stage. */
  requestStage: (targetUserId: string) => void;
  /** Instructor: dismiss the staged work for everyone. */
  clearStage: () => void;
  /** Latest cursor frame from the person on stage — or null (nobody / off-pane). */
  stageCursor: StageCursor | null;
  /**
   * Emission budget for THIS room, derived from the roster (see
   * `utils/stageCursorRate`). `enabled: false` means the room is too large to
   * mirror a cursor on this tier — the UI says so instead of stuttering.
   */
  stageCursorPlan: StageCursorPlan;
  /**
   * True on the client whose own work is on stage: it is the ONE emitter in the
   * room (ADR-2). Everyone else never calls `sendStageCursor`.
   */
  isStageCursorSource: boolean;
  /** Emit one cursor frame. No-op unless this client is the stage source. */
  sendStageCursor: (frame: StageCursorFrame) => void;
  /**
   * O cursor do PROFESSOR sobre o palco, para quem ESTÁ ASSISTINDO (K1 — Tainan
   * na call de 06/08: "aí o prof ajuda dentro da tela do proprio user").
   *
   * É o caminho INVERSO do `stageCursor`: ali o aluno no palco emite e a turma
   * assiste; aqui o professor emite sobre o espelho e a turma — inclusive o
   * aluno no palco, na tela dele — vê onde ele está apontando.
   */
  instructorCursor: StageCursor | null;
  /** Último clique do professor sobre o palco. Some sozinho; ver `StageClick`. */
  instructorClick: StageClick | null;
  /** True apenas no cliente do professor enquanto há palco: é ele quem emite. */
  isInstructorCursorSource: boolean;
  /** Emite um frame do cursor do professor. No-op em qualquer outro cliente. */
  sendInstructorCursor: (frame: StageCursorFrame) => void;
  /** Os traços vivos agora, do mais antigo ao mais novo. Some sozinho. */
  annotations: readonly AnnotationStroke[];
  /** True só no cliente do professor, e só com palco: é ele quem desenha. */
  canAnnotate: boolean;
  /** Manda um lote de pontos. No-op em qualquer outro cliente. */
  sendAnnotation: (frame: Omit<AnnotationFrame, 'userId'>) => void;
  /** Apaga um lote de traços inteiros — a borracha. */
  eraseAnnotations: (strokeIds: string[]) => void;
  /** Apaga tudo, para todo mundo. */
  clearAnnotations: () => void;
  refetch: () => void;
}
