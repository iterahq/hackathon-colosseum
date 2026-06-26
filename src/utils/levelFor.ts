/**
 * Derive a coarse difficulty level from a program's activity volume.
 *
 * WHY: the itera content schema has no explicit `level` field on programs, but
 * the rich {@link ProgramCard} footer shows a difficulty tag (BEGINNER /
 * INTERMEDIATE / ADVANCED) for parity with João Pedro's reference card. We
 * proxy it from the activity count — more activities ≈ a deeper course.
 *
 * Thresholds (inclusive): >=15 advanced · >=7 intermediate · else beginner.
 * Returns the i18n key suffix (consumed as `level.${level}`).
 */
export function levelFor(activityCount: number): 'beginner' | 'intermediate' | 'advanced' {
  if (activityCount >= 15) return 'advanced';
  if (activityCount >= 7) return 'intermediate';
  return 'beginner';
}
