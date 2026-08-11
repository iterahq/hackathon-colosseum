/**
 * LiveActivityRenderer — a thin ADDITIVE wrapper around Samuel's
 * `ActivityRenderer`. Drop-in compatible (SAME props), so it can be swapped in
 * anywhere the base renderer is used to light up the BYOC live path without
 * editing the base renderer.
 *
 * It special-cases ONLY the BYOC live `sandbox_scenario` (spec `openness:'byoc'`
 * / `live:true`, or `forceLive` from the live test route) and renders the NEW
 * `SandboxScenarioLiveActivity`; EVERY other activity — including the 6 existing
 * deterministic sandbox instances — is DELEGATED, unchanged, to Samuel's
 * `ActivityRenderer`. Nothing in `ActivityRenderer` / the `sandbox/` folder / the
 * `@iterahq/activity-spec` runtime is modified.
 *
 * Why a wrapper and not an edit to `ActivityRenderer`'s switch: `ActivityRenderer`
 * is Samuel's actively-developed file and the absolute rule for this round is
 * "never modify his code — duplicate/extend instead". This wrapper is the minimal
 * additive dispatch that keeps his renderer as the single source of truth for
 * every non-live kind (delegate, don't fork).
 */
import { iteraApiConfigured } from '@/api/iteraApi';
import type { Activity } from '@/types/content';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { SandboxScenarioLiveActivity } from '@/components/branded/activity/sandbox-live/SandboxScenarioLiveActivity';
import { isByocLive } from '@/components/branded/activity/sandbox-live/byocLive';
import { usePersonalizedActivity } from '@/personalization/usePersonalizedActivity';
import { isScenarioKind } from '@/utils/activityFamilies';

export function LiveActivityRenderer({
  activity: authored,
  onComplete,
  reveal = false,
  forceLive = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
  /** Force the live path for a `sandbox_scenario` even if the spec isn't marked
   *  byoc yet — used by the opt-in live test route so an instance is testable
   *  before its DB spec is flagged. Ignored for non-sandbox kinds. */
  forceLive?: boolean;
}) {
  // O elenco do aluno entra AQUI, não só no renderer base: o ramo abaixo sai
  // antes dele, e sem isto a aula ao vivo mostraria `{{familiar.nome}}` cru.
  const activity = usePersonalizedActivity(authored);
  const wantsLive = isByocLive(activity) || (forceLive && isScenarioKind(activity.kind));

  // Only take the live path when the Results-API is configured; otherwise fall
  // through to Samuel's renderer so an unconfigured deploy never regresses.
  if (wantsLive && iteraApiConfigured()) {
    return <SandboxScenarioLiveActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
  }

  return <ActivityRenderer activity={activity} onComplete={onComplete} reveal={reveal} live />;
}

export default LiveActivityRenderer;
