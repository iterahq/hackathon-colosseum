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
}

export interface ClassPresenceMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isInstructor: boolean;
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
  /** `code` | `answer` | `empty` (nothing local yet). */
  kind: string;
  content: string;
  status: StageWorkStatus;
}

/** One row of the instructor's stage picker: a present learner + their state. */
export interface StagePickerLearner {
  userId: string;
  name: string;
  avatarUrl: string | null;
  state: StageWorkStatus;
}

/** The work pulled to the class stage: `code` carries raw source, else a summary. */
export interface StagedAnswer {
  activityId: string;
  kind: string;
  content: string;
  /** Draft vs finished vs untouched — drives the "em andamento" badge. */
  status: StageWorkStatus;
  author: StagedAuthor;
}

/** The learner's own persisted answer for one activity (refresh protection). */
export interface StoredLiveAnswer {
  correct: boolean;
  elapsedMs: number;
}

export interface ClassRankingEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Cumulative answer time across the activities the learner has answered, in ms. */
  totalMs: number;
  answeredCount: number;
  correctCount: number;
  /** 1-based position (fastest cumulative time first). */
  rank: number;
}

export interface ClassRanking {
  ranked: ClassRankingEntry[];
  /** Present learners who have not answered anything yet (no timing to rank). */
  waiting: { userId: string; name: string; avatarUrl: string | null }[];
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
}

export interface ClassReportParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  answeredCount: number;
  correctCount: number;
  totalMs: number;
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
  totals: { participants: number; answers: number; correctPct: number };
}

/** Inputs to the learner-side interaction gate (see utils/liveActivityGate). */
export interface LearnerGateInput {
  /** A countdown is currently running for THIS activity. */
  timerRunning: boolean;
  /** The countdown for THIS activity has run out (or the professor stopped it). */
  expired: boolean;
  /** The learner already answered THIS activity. */
  answered: boolean;
}

export interface LearnerGate {
  /** A countdown started (or already ran) for this activity. */
  started: boolean;
  /** Time ran out before the learner answered — inert + revealed. */
  locked: boolean;
  /** The activity stage renders read-only (inert). */
  readOnly: boolean;
  /** A completion may be persisted/broadcast (never locked or already answered). */
  canComplete: boolean;
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
  /** Re-track presence with the hand raised/lowered (learner side). */
  setHandRaised: (raised: boolean) => void;
  /** Re-track presence with the activity the learner has local work for (learner side). */
  setWorkingOn: (activityId: string | null) => void;
  /** Instructor: pull a learner's work for the current activity onto the stage. */
  requestStage: (targetUserId: string) => void;
  /** Instructor: dismiss the staged work for everyone. */
  clearStage: () => void;
  refetch: () => void;
}
