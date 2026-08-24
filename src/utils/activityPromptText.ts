import type { Activity } from '@/types/content';

/**
 * `spec` is validated per kind downstream, so it is read here as plain data:
 * this runs on the instructor surface, which must not reach into a kind's
 * package to learn where that kind keeps its statement.
 */
export function activityPromptText(activity: Activity | null | undefined): string {
  const spec = activity?.spec;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return '';
  const prompt = (spec as { prompt?: unknown }).prompt;
  return typeof prompt === 'string' ? prompt.trim() : '';
}
