/**
 * Raw reads behind the learner dashboard: the program tree (units, lessons, activity ids) the user
 * can read, and their progress rows. The trail states are derived in `utils/trailDashboard`.
 * componente → hook → service → Supabase.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import type { ProgressRow, SourceProgram } from '@/types/trailDashboard';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const bag = (v: unknown): Record<string, string> => (v && typeof v === 'object' ? (v as Record<string, string>) : {});

export interface TrailSource {
  programs: SourceProgram[];
  progress: ProgressRow[];
}

export async function getTrailSource(): Promise<TrailSource> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured — live Itera data unavailable.');
  const sb = getSupabase();
  const userId = await getIteraUserId();

  const [tree, done] = await Promise.all([
    sb
      .from('programs')
      .select(
        `id, slug, title_i18n, created_at,
         units:units ( id, ordinal, title_i18n,
           lessons:lessons ( id, ordinal, title_i18n, activities:activities ( id ) ) )`
      )
      .is('archived_at', null),
    // RLS lets staff read other learners' progress: keep the caller's rows only.
    userId
      ? sb.from('progress').select('activity_id, status, completed_at').eq('user_id', userId).eq('status', 'completed')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tree.error) throw new Error(tree.error.message);
  if (done.error) throw new Error(done.error.message);

  const programs = asRows(tree.data).map((p) => ({
    id: str(p.id),
    slug: str(p.slug),
    title: bag(p.title_i18n),
    createdAt: str(p.created_at),
    units: asRows(p.units).map((u) => ({
      id: str(u.id),
      ordinal: num(u.ordinal),
      title: bag(u.title_i18n),
      lessons: asRows(u.lessons).map((l) => ({
        id: str(l.id),
        ordinal: num(l.ordinal),
        title: bag(l.title_i18n),
        activityIds: asRows(l.activities).map((a) => str(a.id)),
      })),
    })),
  }));
  const progress = asRows(done.data).map((r) => ({
    activityId: str(r.activity_id),
    status: str(r.status),
    completedAt: typeof r.completed_at === 'string' ? r.completed_at : null,
  }));
  return { programs, progress };
}
