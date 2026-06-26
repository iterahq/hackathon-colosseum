/**
 * Itera self-serve CATALOG data layer — browse + enroll into catalog courses.
 *
 * Why this exists (round-1 finding #1): the normal `programs` read is RLS-scoped
 * to the caller's tenant memberships, so a PLG/self-serve user (provisioned into
 * their own personal tenant) can NEVER discover the flagship `modele-dados-com-ia`
 * (it lives under tenant `itera`). The catalog is exposed via two SECURITY DEFINER
 * RPCs (migration 0012):
 *   - itera.catalog_programs()  → membership-independent read of is_catalog=true
 *     programs (cannot leak private content);
 *   - itera.enroll_in_program(id) → idempotent `learner` membership in the
 *     catalog program's tenant. After enroll, normal tenant RLS lets the user
 *     open + play the course.
 *
 * Padrão do projeto (horizontal): componente → hook de query → service → fetch.
 * Sem React aqui. "Recurso não existe" / RPC error = throw → React Query isError.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { CatalogProgram, EnrollResult } from '@/types/catalog';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const bool = (v: unknown): boolean => v === true;
const bag = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : {});

/** Evergreen-family accents so each catalog card gets a stable colored glow. */
const ACCENTS = [
  'from-emerald-500 to-teal-700',
  'from-menta to-verde-tech',
  'from-green-500 to-emerald-700',
  'from-teal-500 to-green-700',
  'from-lime-500 to-emerald-700',
];
const ICONS = ['code', 'layers', 'rocket', 'cpu', 'sparkles'];

/**
 * List the self-serve catalog courses (membership-independent, via the
 * SECURITY DEFINER RPC). Each row is flagged `alreadyEnrolled` so the card can
 * show "Continuar" vs "Matricular". Throws on RPC error.
 */
export async function getCatalogPrograms(): Promise<CatalogProgram[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — live Itera data unavailable.');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('catalog_programs');
  if (error) throw new Error(error.message);

  return asRows(data).map((row, i) => ({
    id: str(row.id),
    tenantId: str(row.tenant_id),
    tenantSlug: str(row.tenant_slug),
    slug: str(row.slug),
    title: bag(row.title_i18n),
    createdAt: str(row.created_at),
    unitCount: num(row.unit_count),
    lessonCount: num(row.lesson_count),
    activityCount: num(row.activity_count),
    alreadyEnrolled: bool(row.already_enrolled),
    accent: ACCENTS[i % ACCENTS.length],
    icon: ICONS[i % ICONS.length],
  }));
}

/**
 * Self-enroll the current user into a catalog program (idempotent `learner`
 * membership in the program's tenant, via the SECURITY DEFINER RPC). Returns the
 * resolved tenant + role + whether a NEW row was created. Throws on RPC error
 * (e.g. not authenticated, program not in catalog).
 */
export async function enrollInProgram(programId: string): Promise<EnrollResult> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — enrollment unavailable.');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('enroll_in_program', { p_program_id: programId });
  if (error) throw new Error(error.message);

  const row = asRows(data)[0] ?? {};
  // The RPC OUT columns are prefixed out_* (renamed to dodge a PL/pgSQL
  // ambiguous-column trap); accept both for forward-compat.
  return {
    tenantId: str(row.out_tenant_id ?? row.tenant_id),
    role: str(row.out_role ?? row.role),
    enrolled: bool(row.out_enrolled ?? row.enrolled),
  };
}
