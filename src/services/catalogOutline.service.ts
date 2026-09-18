/**
 * Syllabus of ONE self-serve catalog program, readable by a signed-in visitor
 * who is not enrolled yet.
 *
 * Tenant RLS hides itera.units / itera.lessons until the caller enrolls, so the
 * syllabus comes from the SECURITY DEFINER RPC itera.catalog_program_outline
 * (migration 0102). It returns one row per lesson, with its unit and program
 * fields, already ordered by unit ordinal then lesson ordinal. A unit without
 * lessons comes as one row with null lesson fields; a program without units as
 * one row with null unit fields. Zero rows = no live catalog program has this
 * slug (unknown, private or archived).
 *
 * componente → hook → service → fetch. No React here.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type {
  CatalogOutlineLesson,
  CatalogOutlineUnit,
  CatalogProgramOutline,
} from '@/types/catalog';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const bag = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : {});

/**
 * Group the flat RPC rows into `{ program, units: [{ lessons }] }`. Keeps the
 * RPC order. Groups by unit id, not ordinal: ordinals are not unique.
 * Returns null for zero rows.
 */
export function groupCatalogOutlineRows(data: unknown): CatalogProgramOutline | null {
  const rows = asRows(data);
  if (rows.length === 0) return null;

  const first = rows[0];
  const units = new Map<string, CatalogOutlineUnit>();
  for (const row of rows) {
    const unitId = str(row.unit_id);
    if (!unitId) continue;
    let unit = units.get(unitId);
    if (!unit) {
      unit = {
        id: unitId,
        ordinal: num(row.unit_ordinal),
        title: bag(row.unit_title_i18n),
        lessons: [],
      };
      units.set(unitId, unit);
    }
    const lessonId = str(row.lesson_id);
    if (!lessonId) continue;
    const lesson: CatalogOutlineLesson = {
      id: lessonId,
      ordinal: num(row.lesson_ordinal),
      title: bag(row.lesson_title_i18n),
      activityCount: num(row.lesson_activity_count),
    };
    unit.lessons.push(lesson);
  }

  return {
    program: {
      id: str(first.program_id),
      slug: str(first.program_slug),
      title: bag(first.program_title_i18n),
    },
    units: [...units.values()],
  };
}

/**
 * Fetch the syllabus of the catalog program with this slug. Resolves null when
 * no live catalog program has it. Throws on RPC error.
 */
export async function getCatalogProgramOutline(
  slug: string,
): Promise<CatalogProgramOutline | null> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — live Itera data unavailable.');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('catalog_program_outline', { p_slug: slug });
  if (error) throw new Error(error.message);
  return groupCatalogOutlineRows(data);
}
