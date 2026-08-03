/**
 * `@iterahq/activities` — the public contract (Fase A).
 *
 * This barrel is what the package's `index.ts` will re-export once Fase B moves
 * `src/components/branded/activity/**` into `packages/activities/`. It lives
 * INSIDE the folder that is going to move, on purpose: the contract travels
 * with the code it describes, instead of being a doc that rots one directory
 * away from it.
 *
 * TYPES ONLY — no runtime export, so importing this from anywhere adds nothing
 * to any bundle. Fase A is a boundary definition; the code does not move yet.
 *
 * Design doc, extraction order and per-kind coverage: ./README.md
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
