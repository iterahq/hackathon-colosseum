/**
 * The shape a future `itera.catalog_program_outline(slug)` RPC would return —
 * see `src/hooks/useProgramOutline.ts` for why it's a seam, not a live read.
 */
export interface ProgramOutlineUnit {
  id: string;
  title: string;
  lessonTitles: string[];
}
