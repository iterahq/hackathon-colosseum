/**
 * Read the authored BYOC harness out of a raw activity `spec`.
 *
 * The resolution itself is `resolveByocSpec` from `@iterahq/activity-spec` — the
 * same function itera-api runs before generating and itera-mcp runs before
 * writing. It used to be reimplemented here, and the copies drifted. Any
 * disagreement about what counts as a valid harness reaches the learner as a
 * silent fallback: a spec the server refuses still renders here as the authored
 * fallback tree, and looks like success.
 *
 * Null, not a reason: at render time there is no author around to read one. The
 * caller-facing message belongs to the authoring MCP and to the API's 422.
 *
 * This deliberately does NOT look at `spec.openness`, which the sandbox kinds
 * already use for their own, unrelated `'byoc'` live-conversation flow
 * (`sandbox-live/byocLive.ts`). The two must not collide.
 */
import { resolveByocSpec, type ByocSpec } from '@iterahq/activity-spec';

export function byocSpecFromRaw(spec: unknown): ByocSpec | null {
  const resolved = resolveByocSpec(spec);
  return resolved.ok ? resolved.spec : null;
}
