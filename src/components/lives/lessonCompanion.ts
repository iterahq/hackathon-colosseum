import { createContext, useContext } from 'react';

/** What the end-of-lesson screen knows about the learner's Tera: the perfect-day bonus and the equipped outfit. */
export interface LessonCompanion {
  bonus: number;
  /** Crystals credited by this lesson. */
  crystals?: number;
  outfit: string | null;
}

const NONE: LessonCompanion = { bonus: 0, outfit: null };

export const LessonCompanionContext = createContext<LessonCompanion>(NONE);
export const useLessonCompanion = (): LessonCompanion => useContext(LessonCompanionContext);
