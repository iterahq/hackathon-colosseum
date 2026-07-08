import type { ClassSession } from '@/services/liveClass.service';

export interface ClassPresenceMember {
  userId: string;
  name: string;
  isInstructor: boolean;
}

export interface ClassCompleter {
  userId: string;
  name: string;
  done: boolean;
}

export type ClassAnswerState = 'pending' | 'wrong' | 'done';

export interface ClassAnswerer {
  userId: string;
  name: string;
  state: ClassAnswerState;
  /** How long the learner took to answer this activity, in ms (when known). */
  elapsedMs?: number;
}

export interface ClassTimer {
  activityId: string;
  deadline: number;
}

export interface UseClassSession {
  session: ClassSession | null;
  currentActivityId: string | null;
  status: ClassSession['status'] | null;
  roster: ClassPresenceMember[];
  connected: boolean;
  loading: boolean;
  answers: Record<string, Record<string, boolean>>;
  /** Per activity → per learner: how long they took to answer, in ms. */
  elapsed: Record<string, Record<string, number>>;
  timer: ClassTimer | null;
  broadcast: (activityId: string) => void;
  broadcastAnswer: (activityId: string, correct: boolean, elapsedMs?: number) => void;
  broadcastTimer: (activityId: string, durationSeconds: number) => void;
  clearTimer: (activityId: string) => void;
  refetch: () => void;
}
