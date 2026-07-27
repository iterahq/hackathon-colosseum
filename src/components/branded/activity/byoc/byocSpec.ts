/**
 * Resolve the authored BYOC harness out of an activity, on top of the pure
 * `byocSpecFromRaw` resolver, adding the one thing the pure version cannot know:
 * whether the itera-api is configured at all. An unconfigured deploy falls back
 * to the host kind rather than showing a dead step 1.
 */
import type { ByocSpec } from '@iterahq/activity-spec';
import { iteraApiConfigured } from '@/api/iteraApi';
import { byocSpecFromRaw } from '@/utils/byocSpec';
import type { Activity } from '@/types/content';

export function resolveByocSpec(activity: Activity): ByocSpec | null {
  if (!iteraApiConfigured()) return null;
  return byocSpecFromRaw(activity.spec);
}

/**
 * The lesson shell needs this too, not just the renderer: BYOC is graded whatever
 * the host kind is, so a `concept` under a harness has to lose concept's free
 * "Continuar" and gain the graded feedback footer.
 */
export function isByocActivity(activity: Activity): boolean {
  return resolveByocSpec(activity) !== null;
}
