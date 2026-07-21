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

/**
 * A professor-triggered reset of one activity — the cue for every client to drop
 * its local answered/expired state so the class can redo it. The `nonce` makes
 * repeated resets of the SAME activity distinct so the consuming effect re-fires.
 */
export interface ClassResetSignal {
  activityId: string;
  nonce: number;
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

/* ── Post-class report (durable answers + attendance, migration 0019) ─────── */

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
  /** The countdown for THIS activity has run out (or the professor revealed it). */
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
  /** Latest professor-triggered reset — consumers drop their per-activity state. */
  resetSignal: ClassResetSignal | null;
  broadcast: (activityId: string) => void;
  broadcastAnswer: (activityId: string, correct: boolean, elapsedMs?: number) => void;
  broadcastTimer: (activityId: string, durationSeconds: number) => void;
  clearTimer: (activityId: string) => void;
  resetActivity: (activityId: string) => void;
  /** Re-track presence with the hand raised/lowered (learner side). */
  setHandRaised: (raised: boolean) => void;
  refetch: () => void;
}
