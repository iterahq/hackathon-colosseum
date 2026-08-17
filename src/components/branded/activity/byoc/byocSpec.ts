/**
 * Resolve the authored BYOC harness out of an activity, on top of the package's
 * pure resolver, adding the two things the pure version cannot know: whether the
 * itera-api is configured at all (an unconfigured deploy falls back to the host
 * kind rather than showing a dead step 1), and which locale the learner is
 * reading in.
 *
 * The locale collapse is not redundant with the one in the services layer:
 * Sandbox specs deliberately reach the renderer with their bilingual
 * bags intact, so a harness riding on a sandbox would never parse. Resolving here
 * makes BYOC independent of the host kind's collapse decision — and mirrors what
 * itera-api does before it validates the same spec.
 */
import { resolveByocSpec as resolveByocFromSpec, type ByocSpec } from '@iterahq/activity-spec';
import { iteraApiConfigured } from '@/api/iteraApi';
import type { Locale } from '@/i18n';
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
  const diagnosis = diagnoseByoc(activity, locale);
  return diagnosis.state === 'ok' ? diagnosis.spec : null;
}

/**
 * The host kind's own teaching context, which BYOC carries over because its
 * layer replaces the host's whole render. It lives OUTSIDE the ByocSpec, so it
 * has to be collapsed on its own — on a sandbox host it reaches the
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

/**
 * Why an activity is or is not rendering as BYOC.
 *
 * `resolveByocSpec` collapses every failure into `null` on purpose — at render
 * time there is no author around to read a reason, and a spec the API refuses
 * still shows the authored fallback, which looks like success. That silence is
 * correct for the learner and wrong for the author: a harness that fails to
 * parse simply never appears, so the edit-test loop reports nothing at all.
 *
 * `claimed` is key presence, not validity: a spec carrying `byoc`/`harness`/`seed`
 * is claiming to be BYOC, and being told the claim was refused is the whole point.
 */
export type ByocDiagnosis =
  | { state: 'absent' }
  | { state: 'api-missing' }
  | { state: 'invalid'; reason: string }
  | { state: 'ok'; spec: ByocSpec };

export function diagnoseByoc(activity: Activity, locale?: Locale): ByocDiagnosis {
  const raw = harnessBearingSpec(activity);
  if (!raw) return { state: 'absent' };
  if (!iteraApiConfigured()) return { state: 'api-missing' };
  const resolved = resolveByocFromSpec(resolveLocalizedSpec(raw, locale));
  // `=== false`, not `!ok`: truthiness does not narrow `ResolvedByoc` to its
  // failing arm against the package's bundled .d.ts, so `reason` goes missing.
  if (resolved.ok === false) return { state: 'invalid', reason: resolved.reason };
  return { state: 'ok', spec: resolved.spec };
}
