/**
 * SEAM for a future unit/lesson outline in the LOCKED program preview (visitor
 * mode, plan 20260918-visitor-mode). Today there is no RPC that returns a
 * catalog program's unit/lesson TITLES without an enrollment:
 * `itera.programs`/`itera.units` reads are membership-scoped RLS, and
 * `itera.catalog_programs()` (db/migrations/0012) only returns aggregate
 * counts, not titles.
 *
 * When a future `itera.catalog_program_outline(slug)` RPC exists (out of scope
 * here — no migration was written for it), wire it into this hook. Until then
 * it always resolves to `null`, and `LockedProgramView` renders the counts it
 * already has from the catalog list, with no unit/lesson list.
 */
import type { ProgramOutlineUnit } from '@/types/programOutline';

export function useProgramOutline(_slug: string | undefined): ProgramOutlineUnit[] | null {
  return null;
}
