/**
 * `@iterahq/activities` — the public contract.
 *
 * Fase A defined this boundary inside the app, at
 * `src/components/branded/activity/contract/`. Fase B moved it here and made it
 * the package's real entrypoint: the app now consumes it as
 * `@iterahq/activities` through the npm workspace, which is the same edge an
 * external host will consume — so the boundary is exercised, not just declared.
 *
 * TYPES ONLY — no runtime export, so importing this adds nothing to any bundle.
 * The renderers themselves arrive in Fase C.
 *
 * Design doc, extraction order and per-kind coverage: ../CONTRACT.md
 */
export type {
  ActivityEvent,
  ActivityEventHandler,
  ActivityEventPayloads,
  ActivityEventType,
  KnownActivityEventType,
  TypedActivityEvent,
} from './events';

export type {
  ActivityApiPort,
  ActivityBrief,
  ActivityI18n,
  ActivityIdentity,
  ActivityJudgeContext,
  ActivityJudgeCriterion,
  ActivityJudgeVerdict,
  ActivityLocale,
  ActivityResponderResult,
  ActivitySeed,
  ActivityStoragePort,
  ActivityTheme,
  ActivityByocGeneration,
} from './ports';

export type {
  ActivityCompleteHandler,
  ActivityCompletion,
  ActivityHostContext,
  ActivityProviderProps,
  ActivityRendererProps,
  PortableActivity,
  PortableActivityStatus,
  PortableArtifactType,
  PortableProducedArtifact,
} from './renderer';
