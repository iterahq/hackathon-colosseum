import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { serviceClient } from '../_shared/db.ts';
import { bearerToken, corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { sealActivity } from '../_shared/seal.ts';
import { sealSecret } from '../_shared/seal-secret.ts';

const LESSON_COLUMNS = 'id,title_i18n,ordinal,unit:units(ordinal,title_i18n,program:programs(slug)),activities:activities(id,lesson_id,ordinal,kind,status,artifact_policy)';
const ACTIVITY_COLUMNS = 'id,lesson_id,ordinal,kind,status,artifact_policy';

interface VisibleActivity {
  id: string;
  lesson_id: string;
  ordinal: number;
  kind: string;
  status: string;
  artifact_policy: unknown;
}

/** A client that reads as the caller: row level security decides which lesson and which activities exist for them. */
function callerClient(token: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Supabase anon credentials are not configured');
  return createClient(url, anonKey, {
    db: { schema: 'itera' },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * The lesson a learner plays. Which rows exist is the caller's own row level
 * security; the specs are read here with the service role and leave sealed.
 * Whoever teaches or authors the lesson's program receives them whole.
 */
Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const body = await readJsonObject(request);
    const token = bearerToken(request);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    if (!token) return json({ error: 'unauthorized' }, 401, cors);
    const lessonId = typeof body.lesson_id === 'string' && isUuid(body.lesson_id) ? body.lesson_id : null;
    const activityId = typeof body.activity_id === 'string' && isUuid(body.activity_id) ? body.activity_id : null;
    if (!lessonId && !activityId) return json({ error: 'invalid_body' }, 400, cors);

    const caller = callerClient(token);
    const db = serviceClient();
    const content = db.from('activities').select('id,spec,rubric');

    let lesson: Record<string, unknown> | null = null;
    let visible: VisibleActivity[];
    let specs: Array<{ id: string; spec: unknown; rubric: unknown }>;
    let staff = false;

    if (lessonId) {
      const [lessonRead, staffRead, specRead] = await Promise.all([
        caller.from('lessons').select(LESSON_COLUMNS).eq('id', lessonId).maybeSingle(),
        caller.rpc('can_read_answer_key', { p_lesson_id: lessonId }),
        content.eq('lesson_id', lessonId),
      ]);
      if (lessonRead.error) return json({ error: 'unauthorized' }, 401, cors);
      if (!lessonRead.data) return json({ error: 'lesson_not_found' }, 404, cors);
      if (specRead.error) throw new Error(`activities: ${specRead.error.message}`);
      const { activities, ...rest } = lessonRead.data as Record<string, unknown>;
      lesson = rest;
      visible = (activities ?? []) as VisibleActivity[];
      specs = specRead.data ?? [];
      staff = staffRead.data === true;
    } else {
      const visibleRead = await caller.from('activities').select(ACTIVITY_COLUMNS).eq('id', activityId as string).maybeSingle();
      if (visibleRead.error) return json({ error: 'unauthorized' }, 401, cors);
      if (!visibleRead.data) return json({ error: 'activity_not_found' }, 404, cors);
      visible = [visibleRead.data as VisibleActivity];
      const [staffRead, specRead] = await Promise.all([
        caller.rpc('can_read_answer_key', { p_lesson_id: visible[0].lesson_id }),
        content.eq('id', activityId as string),
      ]);
      if (specRead.error) throw new Error(`activities: ${specRead.error.message}`);
      specs = specRead.data ?? [];
      staff = staffRead.data === true;
    }

    const secret = sealSecret();
    const serving = crypto.randomUUID();
    const byId = new Map(specs.map((row) => [row.id, row]));
    const activities = visible
      .filter((row) => byId.has(row.id))
      .map((row) => {
        const full = byId.get(row.id) as { spec: unknown; rubric: unknown };
        const sealed = sealActivity({ id: row.id, kind: row.kind, spec: full.spec }, secret, serving);
        return staff
          ? { ...row, spec: full.spec, rubric: full.rubric, graded_by: sealed.graded_by, sealed: false }
          : { ...row, rubric: full.rubric, ...sealed };
      });

    return json({ lesson, activities }, 200, { ...cors, 'Cache-Control': 'private, no-store' });
  } catch (error) {
    console.error('lesson failed', error);
    return json({ error: 'internal_error', retryable: true }, 500, cors);
  }
});
