/**
 * Self-serve catalog types (round-1 finding #1 — discovery + enrollment).
 *
 * A CatalogProgram is the membership-independent view of a catalog course
 * returned by itera.catalog_programs() (migration 0012). It mirrors the canonical
 * content model but adds catalog-only fields (tenantSlug, alreadyEnrolled).
 */
import type { I18nText } from '@/types/content';

export interface CatalogProgram {
  id: string;
  tenantId: string;
  /** The owning tenant slug (e.g. 'itera') — informational. */
  tenantSlug: string;
  slug: string;
  title: I18nText;
  createdAt: string;
  unitCount: number;
  lessonCount: number;
  activityCount: number;
  /** True when the caller already holds a membership in this program's tenant. */
  alreadyEnrolled: boolean;
  accent?: string;
  icon?: string;
}

/**
 * Syllabus of ONE catalog program, readable before enrollment, returned by
 * itera.catalog_program_outline(p_slug) (migration 0102). Titles and counts
 * only — never activity content.
 */
export interface CatalogOutlineLesson {
  id: string;
  ordinal: number;
  title: I18nText;
  /** Published activities only. */
  activityCount: number;
}

export interface CatalogOutlineUnit {
  id: string;
  ordinal: number;
  title: I18nText;
  lessons: CatalogOutlineLesson[];
}

export interface CatalogProgramOutline {
  program: { id: string; slug: string; title: I18nText };
  units: CatalogOutlineUnit[];
}

export interface EnrollResult {
  tenantId: string;
  role: string;
  /** True when a NEW membership row was created (false = already enrolled). */
  enrolled: boolean;
}
