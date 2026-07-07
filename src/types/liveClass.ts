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
}

export interface UseClassSession {
  session: ClassSession | null;
  currentActivityId: string | null;
  status: ClassSession['status'] | null;
  roster: ClassPresenceMember[];
  connected: boolean;
  loading: boolean;
  answers: Record<string, Record<string, boolean>>;
  broadcast: (activityId: string) => void;
  broadcastAnswer: (activityId: string, correct: boolean) => void;
  refetch: () => void;
}
