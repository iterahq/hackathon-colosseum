/**
 * Read the authored BYOC harness out of a raw activity `spec`, mirroring
 * itera-api's own resolver so the player and the server agree on which
 * activities are BYOC.
 *
 * Two accepted shapes, nested first:
 *   - `spec.byoc = {seed, harness, fallback?}` — BYOC riding on top of a kind
 *     that already owns its spec root;
 *   - the spec root itself IS a ByocSpec — a dedicated BYOC activity.
 *
 * An explicit-but-invalid `spec.byoc` resolves to null rather than falling
 * through to the root: that is an authoring bug, and hijacking the render would
 * hide it behind a generic failure.
 *
 * This deliberately does NOT look at `spec.openness`, which `sandbox_scenario`
 * already uses for its own, unrelated `'byoc'` live-conversation flow
 * (`sandbox-live/byocLive.ts`). The two must not collide.
 */
import { ByocSpecSchema, type ByocSpec } from '@iterahq/activity-spec';

export function byocSpecFromRaw(spec: unknown): ByocSpec | null {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  const raw = spec as Record<string, unknown>;

  if (raw.byoc !== undefined) {
    const nested = ByocSpecSchema.safeParse(raw.byoc);
    return nested.success ? nested.data : null;
  }

  const root = ByocSpecSchema.safeParse(raw);
  return root.success ? root.data : null;
}
