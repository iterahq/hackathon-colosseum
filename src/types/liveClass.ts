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
  /** `code` | `answer` | `empty` (nothing local yet). */
  kind: string;
  content: string;
  status: StageWorkStatus;
}

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
  /** Stars the professor gave, net of the ones taken back. Never below zero. */
  stars: number;
}

/** What the professor can do to a learner, regardless of the current activity. */
export interface LiveRoomModeration {
  /** `+1` rewards, `-1` takes one back. Writes itera.class_stars, then broadcasts. */
  onStar: (userId: string, delta: 1 | -1) => void;
  /** Ask the learner's own client to lower the hand (presence is owner-write). */
  onLowerHand: (userId: string) => void;
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
  /** Stars from the professor. Shown apart from `correctCount` so the class can
   *  see where the points came from, but summed into the ordering. */
  stars: number;
  /** 1-based position (most points first, cumulative time breaks the tie). */
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
  /** Stars per learner for this session (itera.class_stars, floored at zero). */
  stars: Record<string, number>;
  /** This client was removed from the room — the realtime JOIN is denied now. */
  removed: boolean;
  /** Learner side: is my own hand up. Single source of truth (presence rides it). */
  handRaised: boolean;
  /** Re-track presence with the hand raised/lowered (learner side). */
  setHandRaised: (raised: boolean) => void;
  /** Instructor: give (+1) or take back (-1) a star. Resolves false if the write failed. */
  awardStar: (userId: string, delta: 1 | -1) => Promise<boolean>;
  /** Instructor: ask a learner's own client to lower its hand (presence is owner-write). */
  lowerHand: (userId: string) => void;
  /** Instructor: remove a learner from the room. Resolves false if the write failed. */
  removeLearner: (userId: string) => Promise<boolean>;
  /** Re-track presence with the activity the learner has local work for (learner side). */
  setWorkingOn: (activityId: string | null) => void;
  /** Instructor: pull a learner's work for the current activity onto the stage. */
  requestStage: (targetUserId: string) => void;
  /** Instructor: dismiss the staged work for everyone. */
  clearStage: () => void;
  refetch: () => void;
}
