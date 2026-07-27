/**
 * BYOC ("Bring Your Own Context") wire types — the learner types a seed (a hobby,
 * in their own words) and the model builds the activity on top of it.
 *
 * Authoring lives in `activities.spec` as a NESTED `spec.byoc` block (or, for a
 * dedicated activity, the spec root) — BYOC is a layer over an existing kind, NOT
 * an `activity_kind` of its own, so it costs no enum value and does not collide
 * with `sandbox_scenario`'s pre-existing `openness: 'byoc'`.
 */
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';

/**
 * One generation, as itera-api `POST/GET /v1/embed/activity/:id/byoc` serializes
 * it. The server sends EVERY key on EVERY branch (a field that only sometimes
 * exists is a trap), so nothing here is optional.
 *
 * `generated` carries the gabarito (`correct_option_id`, or `expected_verdict`
 * per option). That is deliberate (ADR-13): the model runs ONCE, at generation
 * time, and correction is a local lookup — no judge and no model call in the
 * answer path.
 */
export interface ByocGeneration {
  generation_id: string | null;
  activity_id: string;
  attempt: number | null;
  seed: string;
  mode: string;
  generated: GeneratedChoiceTree;
  fallback_used: boolean;
  attempts_used: number;
  model: string;
  degraded_reason: string | null;
  created_at: string | null;
  /** True when this tree came back from a previous attempt instead of a new call. */
  reused: boolean;
  /** False when the tree is the authored fallback rather than model output. */
  generation_available: boolean;
  persisted: boolean;
}
