export interface VideoLesson {
  id: string;
  courseId: string;
  title: string;
  description: string;
  videoUrl: string;
  durationSeconds: number;
  position: number;
}

export interface VideoCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  teacherAvatarUrl: string | null;
  position: number;
  lessons: VideoLesson[];
}

/** lesson id -> completion time (epoch ms) */
export type VideoProgress = ReadonlyMap<string, number>;

export type VideoCourseState = 'new' | 'in_progress' | 'done';
export type VideoCourseFilter = 'all' | VideoCourseState;
