import type { I18nText } from '@/types/content';

export interface SourceLesson {
  id: string;
  ordinal: number;
  title: I18nText;
  activityIds: string[];
}

export interface SourceUnit {
  id: string;
  ordinal: number;
  title: I18nText;
  lessons: SourceLesson[];
}

export interface SourceProgram {
  id: string;
  slug: string;
  title: I18nText;
  createdAt: string;
  units: SourceUnit[];
}

export interface ProgressRow {
  activityId: string;
  status: string;
  completedAt: string | null;
}

export type DayState = 'done' | 'current' | 'upcoming';
export type TrailStatus = 'done' | 'in_progress' | 'fresh' | 'locked';

export interface TrailDay {
  id: string;
  title: I18nText;
  total: number;
  done: number;
  state: DayState;
}

export interface Trail {
  id: string;
  programSlug: string;
  programTitle: I18nText;
  title: I18nText;
  days: TrailDay[];
  totalActivities: number;
  doneActivities: number;
  doneDays: number;
  status: TrailStatus;
  lastProgressAt: number | null;
  /** Title of the previous trail of the program, when this one waits for it. */
  unlockedBy: I18nText | null;
  colorIndex: number;
}

export interface TrailColor {
  c: string;
  cl: string;
  cs: string;
  cd: string;
  ink: string;
  /** Stroke of the big outlined number behind the featured trail. */
  ghost: string;
}

export interface PathOptions {
  W: number;
  H: number;
  A: number;
  r: number;
  vertical?: boolean;
}

export interface PathNode {
  cx: number;
  cy: number;
  day: number;
  state: DayState;
  r: number;
  /** Radius of the pulsing ring, 0 when the node is not the current one. */
  ring: number;
  icon: string;
  label: string;
  fontSize: number;
  textY: number;
}

export interface TrailPath {
  base: string;
  done: string;
  live: string;
  nodes: PathNode[];
}
