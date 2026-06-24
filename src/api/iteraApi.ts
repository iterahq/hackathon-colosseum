/**
 * Tiny client for the Itera Results-API (itera-api) — the AI-generation +
 * AI-judge loop for open-scope activities.
 *
 * Capability-probe (ADR player-judge-surface-guarded): if VITE_ITERA_API_BASE is
 * unset, `iteraApiConfigured()` is false and the judge/generation surfaces in the
 * player stay dormant (the activity keeps its existing read-only behavior) — so
 * unconfigured deploys never regress course #1.
 *
 * The learner's auth token is the Supabase session access_token (the same token
 * the embed/standalone player already holds). The itera-api /embed routes verify
 * it (HS256-first, then ES256/JWKS) and resolve the Itera user.
 */

const BASE = (import.meta.env.VITE_ITERA_API_BASE as string | undefined)?.replace(/\/$/, "");

export function iteraApiConfigured(): boolean {
  return Boolean(BASE);
}

/** A seed business domain the learner can pick to contextualize the activity. */
export interface Seed {
  id: string;
  label: string;
}

/** The AI-generated, contextualized brief. */
export interface GeneratedBrief {
  activity_id: string;
  seed: string;
  domain: string;
  scenario: string;
  proposed_er: string;
  prompt: string;
  model: string;
  generation_available: boolean;
}

/** A per-criterion heat-map cell from the judge. */
export interface JudgeCriterion {
  criterion: string;
  met: boolean;
  note?: string;
}

/** The judge verdict the player renders. */
export interface JudgeVerdict {
  result_id: string;
  activity_id: string;
  attempt: number;
  status: "passed" | "failed" | "pending";
  passed: boolean;
  score: number | null;
  feedback: string;
  criteria: JudgeCriterion[];
  model: string;
  progress_status: "completed" | "in_progress";
  judge_available: boolean;
}

async function postJson<T>(path: string, body: unknown, token: string): Promise<T> {
  if (!BASE) throw new Error("itera-api not configured (VITE_ITERA_API_BASE unset)");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(body as object), dfl_token: token }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`itera-api ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** List the seed domains for the picker. (Open GET — no token needed.) */
export async function listSeeds(activityId: string): Promise<Seed[]> {
  if (!BASE) return [];
  const res = await fetch(`${BASE}/v1/embed/activity/${activityId}/context`);
  if (!res.ok) return [];
  const data = (await res.json()) as { seeds?: Seed[] };
  return data.seeds ?? [];
}

/** Generate the contextualized brief for a chosen seed. */
export function generateContext(
  activityId: string,
  seed: string,
  token: string
): Promise<GeneratedBrief> {
  return postJson<GeneratedBrief>(`/v1/embed/activity/${activityId}/context`, { seed }, token);
}

/** Submit the learner's open-scope artifact for AI judging. */
export function judge(
  activityId: string,
  content: string,
  token: string,
  generatedContext?: Pick<GeneratedBrief, "seed" | "domain" | "scenario" | "proposed_er">
): Promise<JudgeVerdict> {
  return postJson<JudgeVerdict>(
    "/v1/embed/judge",
    {
      activity_id: activityId,
      content,
      ...(generatedContext
        ? {
            generated_context: {
              seed: generatedContext.seed,
              domain: generatedContext.domain,
              scenario: generatedContext.scenario,
              proposed_er: generatedContext.proposed_er,
            },
          }
        : {}),
    },
    token
  );
}
