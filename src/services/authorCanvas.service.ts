/**
 * Author review canvas data layer (plan 20260706, Phase 4).
 *
 * Reads ONE unit's deep graph (program → unit → lessons → activities, incl. the
 * `status` publish-lifecycle column) for the per-unit review+comment canvas.
 * RLS-scoped: an author sees their tenant's drafts + published; a plain learner
 * would only ever see published rows (student read path). Content is READ-ONLY
 * here — the only writes the canvas makes are `activity_comments` rows + the
 * `activities.status` publish flip (see comments.service.ts).
 *
 * Padrão do projeto: componente → hook (useQuery) → service → fetch. No React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { resolveLocalizedSpec } from '@/utils/resolveLocalizedSpec';
import type { Activity, I18nText, Program } from '@/types/content';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const bag = (v: unknown) =>
  v && typeof v === 'object' ? (v as Record<string, string>) : {};

/** A lesson row within the canvas (rows of the grid). */
export interface CanvasLesson {
  id: string;
  unitId: string;
  ordinal: number;
  title: I18nText;
  activities: Activity[];
}

/** The full per-unit canvas graph: one unit + its program context + lessons. */
export interface UnitCanvas {
  tenantId: string;
  program: { id: string; slug: string; title: I18nText };
  unit: { id: string; programId: string; ordinal: number; title: I18nText };
  lessons: CanvasLesson[];
}

function client() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — live Itera data unavailable.');
  }
  return getSupabase();
}

function mapActivity(a: Row): Activity {
  const status = str(a.status);
  const kind = str(a.kind) as Activity['kind'];
  const rawSpec = a.spec && typeof a.spec === 'object' ? (a.spec as Record<string, unknown>) : {};
  return {
    id: str(a.id),
    lessonId: str(a.lesson_id),
    ordinal: num(a.ordinal),
    kind,
    // The sandbox runtime resolves its own bilingual bags; every other kind
    // renders spec strings directly, so collapse bags before they reach the DOM.
    spec: kind === 'sandbox_scenario' ? rawSpec : resolveLocalizedSpec(rawSpec),
    rubric:
      a.rubric && typeof a.rubric === 'object' ? (a.rubric as Record<string, unknown>) : null,
    publishStatus: status === 'published' ? 'published' : status === 'draft' ? 'draft' : undefined,
    // The authored persistence policy (migration 0027). The canvas is the only
    // surface that EDITS it, so it has to round-trip through this mapper.
    artifactPolicy:
      a.artifact_policy && typeof a.artifact_policy === 'object'
        ? (a.artifact_policy as Record<string, unknown>)
        : null,
  };
}

/**
 * The per-unit review canvas graph. Reads the single unit by id, embedding its
 * parent program (for tenant/ref context) + its lessons + each lesson's
 * activities (incl. `status`). Lessons + activities are ordinal-sorted so the
 * grid is deterministic. Throws (→ isError) when the unit can't be resolved.
 */
export async function getUnitCanvas(unitId: string): Promise<UnitCanvas> {
  const sb = client();
  const { data, error } = await sb
    .from('units')
    .select(
      `id, program_id, ordinal, title_i18n,
       program:programs ( id, tenant_id, slug, title_i18n ),
       lessons:lessons (
         id, unit_id, ordinal, title_i18n,
         activities:activities ( id, lesson_id, ordinal, kind, spec, rubric, status, artifact_policy )
       )`
    )
    .eq('id', unitId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Unit not found: ${unitId}`);
  const row = data as Row;

  // The embedded program may arrive as an object or a single-element array
  // depending on PostgREST's cardinality inference (same guard as membership).
  const p = Array.isArray(row.program)
    ? (row.program[0] as Row | undefined)
    : (row.program as Row | undefined);

  const lessons: CanvasLesson[] = asRows(row.lessons)
    .map((l) => ({
      id: str(l.id),
      unitId: str(l.unit_id),
      ordinal: num(l.ordinal),
      title: bag(l.title_i18n),
      activities: asRows(l.activities)
        .map(mapActivity)
        .sort((x, y) => x.ordinal - y.ordinal),
    }))
    .sort((x, y) => x.ordinal - y.ordinal);

  return {
    tenantId: str(p?.tenant_id),
    program: { id: str(p?.id), slug: str(p?.slug), title: bag(p?.title_i18n) },
    unit: {
      id: str(row.id),
      programId: str(row.program_id),
      ordinal: num(row.ordinal),
      title: bag(row.title_i18n),
    },
    lessons,
  };
}

/**
 * A single activity (id, kind, spec, rubric, status) for the standalone TEST
 * harness route. RLS-scoped (an author sees their tenant's drafts + published).
 * Throws (→ isError) when the activity can't be resolved.
 */
export async function getActivityById(activityId: string): Promise<Activity> {
  const sb = client();
  const { data, error } = await sb
    .from('activities')
    .select('id, lesson_id, ordinal, kind, spec, rubric, status, artifact_policy')
    .eq('id', activityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Activity not found: ${activityId}`);
  return mapActivity(data as Row);
}

/** A program + its units, for the author home drill-down into per-unit canvases. */
export interface AuthorProgramUnits {
  program: Pick<Program, 'id' | 'slug' | 'title'>;
  units: { id: string; ordinal: number; title: I18nText; lessonCount: number }[];
}

/**
 * The author's programs with their units (RLS-scoped to the author's tenants).
 * Drives the `/author` home: each program lists its units, each linking into
 * the per-unit canvas. Ordinal-sorted for a stable layout.
 */
export async function getAuthorPrograms(): Promise<AuthorProgramUnits[]> {
  const sb = client();
  const { data, error } = await sb
    .from('programs')
    .select(
      `id, slug, title_i18n, created_at,
       units:units ( id, ordinal, title_i18n, lessons:lessons ( id ) )`
    )
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return asRows(data).map((row) => ({
    program: { id: str(row.id), slug: str(row.slug), title: bag(row.title_i18n) },
    units: asRows(row.units)
      .map((u) => ({
        id: str(u.id),
        ordinal: num(u.ordinal),
        title: bag(u.title_i18n),
        lessonCount: asRows(u.lessons).length,
      }))
      .sort((a, b) => a.ordinal - b.ordinal),
  }));
}
