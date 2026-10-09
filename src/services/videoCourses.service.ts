/** Video courses (`itera.video_courses` / `video_lessons`) and the learner's own `video_progress` rows. */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import type { VideoCourse, VideoLesson } from '@/types/videoCourses';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const notConfigured = () => new Error('Supabase not configured — live Itera data unavailable.');

function toLesson(r: Row, courseId: string): VideoLesson {
  return {
    id: str(r.id),
    courseId,
    title: str(r.title),
    description: str(r.description),
    videoUrl: str(r.video_url),
    durationSeconds: num(r.duration_seconds),
    position: num(r.position),
  };
}

export async function getVideoCourses(): Promise<VideoCourse[]> {
  if (!isSupabaseConfigured) throw notConfigured();
  const { data, error } = await getSupabase()
    .schema('itera')
    .from('video_courses')
    .select('id, slug, title, description, thumbnail_url, teacher_name, teacher_avatar_url, position, video_lessons(id, title, description, video_url, duration_seconds, position)')
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return asRows(data).map((r) => {
    const id = str(r.id);
    return {
      id,
      slug: str(r.slug),
      title: str(r.title),
      description: str(r.description),
      thumbnailUrl: orNull(r.thumbnail_url),
      teacherName: str(r.teacher_name),
      teacherAvatarUrl: orNull(r.teacher_avatar_url),
      position: num(r.position),
      lessons: asRows(r.video_lessons)
        .map((l) => toLesson(l, id))
        .sort((a, b) => a.position - b.position),
    };
  });
}

/** lesson id -> completion time (epoch ms) for the signed-in learner. */
export async function getMyVideoProgress(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) throw notConfigured();
  const userId = await getIteraUserId();
  if (!userId) return {};
  const { data, error } = await getSupabase().schema('itera').from('video_progress').select('lesson_id, completed_at').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of asRows(data)) out[str(r.lesson_id)] = Date.parse(str(r.completed_at)) || Date.now();
  return out;
}

export async function setLessonWatched(lessonId: string, watched: boolean): Promise<void> {
  if (!isSupabaseConfigured) throw notConfigured();
  const userId = await getIteraUserId();
  if (!userId) throw new Error('No Itera user for this session.');
  const table = getSupabase().schema('itera').from('video_progress');
  const { error } = watched
    ? await table.upsert({ user_id: userId, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
    : await table.delete().eq('user_id', userId).eq('lesson_id', lessonId);
  if (error) throw new Error(error.message);
}
