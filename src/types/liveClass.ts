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

export interface UseClassSession {
  session: ClassSession | null;
  currentActivityId: string | null;
  status: ClassSession['status'] | null;
  roster: ClassPresenceMember[];
  connected: boolean;
  loading: boolean;
  completions: Record<string, string[]>;
  broadcast: (activityId: string) => void;
  broadcastCompletion: (activityId: string) => void;
  refetch: () => void;
}
