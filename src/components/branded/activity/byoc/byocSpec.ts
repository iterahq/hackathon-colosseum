/**
 * Resolve the authored BYOC harness out of an activity, on top of the pure
 * `byocSpecFromRaw` resolver, adding the two things the pure version cannot know:
 * whether the itera-api is configured at all (an unconfigured deploy falls back
 * to the host kind rather than showing a dead step 1), and which locale the
 * learner is reading in.
 *
 * The locale collapse is not redundant with the one in the services layer:
 * `sandbox_scenario` specs deliberately reach the renderer with their bilingual
 * bags intact, so a harness riding on a sandbox would never parse. Resolving here
 * makes BYOC independent of the host kind's collapse decision — and mirrors what
 * itera-api does before it validates the same spec.
 */
import type { ByocSpec } from '@iterahq/activity-spec';
import { iteraApiConfigured } from '@/api/iteraApi';
import type { Locale } from '@/i18n';
import { byocSpecFromRaw } from '@/utils/byocSpec';
import { resolveLocalizedSpec } from '@/utils/resolveLocalizedSpec';
import type { Activity, InstructionPanelSpec } from '@/types/content';

/** The spec root, only when it could plausibly carry a harness. */
function harnessBearingSpec(activity: Activity): Record<string, unknown> | null {
  const spec = activity.spec;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  const raw = spec as Record<string, unknown>;
  // Deep-cloning EVERY activity's spec on every render is not free: the live
  // class re-renders on each timer tick, and this runs for all 12 kinds. Key
  // presence, not value: a jsonb `byoc: null` IS a claim to be BYOC, and the
  // resolver has to see it to refuse it.
  if (!('byoc' in raw) && !('harness' in raw) && !('seed' in raw)) return null;
  return raw;
}

export function resolveByocSpec(activity: Activity, locale?: Locale): ByocSpec | null {
  if (!iteraApiConfigured()) return null;
  const raw = harnessBearingSpec(activity);
  if (!raw) return null;
  return byocSpecFromRaw(resolveLocalizedSpec(raw, locale));
}

/**
 * The host kind's own teaching context, which BYOC carries over because its
 * layer replaces the host's whole render. It lives OUTSIDE the ByocSpec, so it
 * has to be collapsed on its own — on a `sandbox_scenario` host it reaches the
 * renderer bilingual, and `RichText` would call `.replace` on an object.
 */
export function resolveByocInstruction(
  activity: Activity,
  locale?: Locale
): InstructionPanelSpec | undefined {
  const raw = harnessBearingSpec(activity);
  const instruction = raw?.instruction;
  if (!instruction || typeof instruction !== 'object' || Array.isArray(instruction)) return undefined;
  return resolveLocalizedSpec(
    instruction as Record<string, unknown>,
    locale
  ) as InstructionPanelSpec;
}

/**
 * The lesson shell needs this too, not just the renderer: BYOC is graded whatever
 * the host kind is, so a `concept` under a harness has to lose concept's free
 * "Continuar" and gain the graded feedback footer.
 */
export function isByocActivity(activity: Activity): boolean {
  return resolveByocSpec(activity) !== null;
}
