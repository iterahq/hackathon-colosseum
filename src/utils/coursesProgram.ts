/**
 * The program page as trails: a ProgramDetail folded with the dashboard's `buildTrails`, so a unit
 * unlocks in order and a day is done when all its activities are completed.
 */
import type { ProgramDetail } from '@/types/content';
import type { ProgressRow, Trail } from '@/types/trailDashboard';
import { buildTrails } from '@/utils/trailDashboard';

const isDone = (status: string | undefined): boolean => status === 'done' || status === 'completed';

export function programTrails(program: ProgramDetail): Trail[] {
  const progress: ProgressRow[] = [];
  const source = {
    id: program.id,
    slug: program.slug,
    title: program.title,
    createdAt: program.createdAt,
    units: program.units.map((unit) => ({
      id: unit.id,
      ordinal: unit.ordinal,
      title: unit.title,
      lessons: (unit.lessons ?? []).map((lesson) => ({
        id: lesson.id,
        ordinal: lesson.ordinal,
        title: lesson.title,
        activityIds: (lesson.activities ?? []).map((a) => {
          if (isDone(a.status)) progress.push({ activityId: a.id, status: 'completed', completedAt: null });
          return a.id;
        }),
      })),
    })),
  };
  return buildTrails([source], progress);
}

export interface ProgramTotals {
  units: number;
  lessons: number;
  activities: number;
  doneActivities: number;
  doneLessons: number;
}

export function programTotals(trails: readonly Trail[]): ProgramTotals {
  return {
    units: trails.length,
    lessons: trails.reduce((n, t) => n + t.days.length, 0),
    activities: trails.reduce((n, t) => n + t.totalActivities, 0),
    doneActivities: trails.reduce((n, t) => n + t.doneActivities, 0),
    doneLessons: trails.reduce((n, t) => n + t.doneDays, 0),
  };
}
