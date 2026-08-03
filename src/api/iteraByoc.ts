/**
 * BYOC client — itera-api `/v1/embed/activity/:activity_id/byoc`.
 *
 * Split out of `iteraApi.ts` because BYOC is the only surface whose GET carries
 * the token in a header rather than the body.
 */
import { GeneratedChoiceTreeSchema } from '@iterahq/activity-spec';
import { iteraApiBase, postJson } from './iteraApi';
import { parseIteraApiError } from './iteraApiError';
import type { ByocGeneration } from '@/types/byoc';

/**
 * The tree is MODEL output that crossed the wire, so it is untrusted here even
 * though the server validated it. Rejecting a malformed one lets the caller show
 * its retry path instead of crashing the activity mid-render.
 */
function checkedGeneration(raw: ByocGeneration): ByocGeneration {
  const parsed = GeneratedChoiceTreeSchema.safeParse(raw?.generated);
  if (!parsed.success) throw new Error('itera-api returned a malformed byoc tree');
  return { ...raw, generated: parsed.data };
}

/**
 * Sits ABOVE the server's own 90s generation budget: without it a stalled socket
 * parks the learner on the spinner forever, with no way back to the seed form.
 */
const BYOC_TIMEOUT_MS = 120_000;

function timeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * Generate the activity from the learner's seed.
 *
 * Idempotent by default: a learner who already generated gets that SAME tree
 * back (`reused: true`, no model call), so a reload never re-rolls the question
 * they are graded on. Generation measured 26–58s in production against the free
 * model; the server's own timeout is 90s.
 *
 * `regenerate` is the escape from that idempotency, and the SERVER decides
 * whether to honor it — the client asking is not enough. Over a degraded row
 * (`fallback_used`) anyone gets it, or the learner who generated during an
 * outage would be served the ready-made example forever. Over a real generation
 * only someone who can author the activity does, because a stable question is
 * what makes correction local for everybody else.
 */
export async function generateByoc(
  activityId: string,
  seed: string,
  token: string,
  regenerate = false
): Promise<ByocGeneration> {
  const t = timeout(BYOC_TIMEOUT_MS);
  try {
    const raw = await postJson<ByocGeneration>(
      `/v1/embed/activity/${encodeURIComponent(activityId)}/byoc`,
      regenerate ? { seed, regenerate: true } : { seed },
      token,
      t.signal
    );
    return checkedGeneration(raw);
  } finally {
    t.clear();
  }
}

/**
 * Read back THIS learner's existing generation, or null when they have none.
 *
 * Bearer header rather than a query param: this is a live session credential and
 * a query string lands in access logs and browser history.
 */
export async function readByoc(
  activityId: string,
  token: string
): Promise<ByocGeneration | null> {
  const base = iteraApiBase();
  if (!base) return null;
  const t = timeout(BYOC_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/embed/activity/${encodeURIComponent(activityId)}/byoc`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: t.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw parseIteraApiError(res.status, await res.text().catch(() => ''));
    return checkedGeneration((await res.json()) as ByocGeneration);
  } finally {
    t.clear();
  }
}
