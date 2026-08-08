/**
 * MOVED — `ArtifactVisibilityNotice` now lives in `@iterahq/activities`
 * (Fase D). It crossed with the `document` kind, its only caller.
 *
 * ⚠️ WHAT CHANGED BEHIND THIS RE-EXPORT, because it is not a pure move.
 *
 * The component used to call `hasTenantAudience()` from
 * `@/services/artifact.service` on mount — i.e. it queried Supabase from inside
 * the activity tree, once per document activity rendered. A library cannot hold
 * a Supabase client, so the fact is now RESOLVED BY THE HOST and passed as
 * `identity.artifactAudience`; `IteraActivityHost` does that resolution once
 * per session, gated on `authenticated`.
 *
 * The visible behaviour is preserved, including the fail-closed default: only
 * the literal `'tenant'` shows the notice, and `'unknown'` (the value while the
 * host is still resolving, or when the resolution threw) keeps it hidden. Never
 * claim a reader exists when we cannot confirm it.
 */
export { ArtifactVisibilityNotice } from '@iterahq/activities';
