/**
 * `@iterahq/activities/code` — the `code` kind, behind its own door.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY A SECOND ENTRYPOINT (ADR-5)
 * ═════════════════════════════════════════════════════════════════════════════
 * Most hosts render concept / choice / match / order. `code` drags a runtime
 * transpiler (`sucrase`), a self-contained preview document, the deterministic
 * check runner, and — in any host that wants syntax highlighting — an editor of
 * several megabytes. Charging every consumer for that so one of them can render
 * a snack is exactly the trade ADR-5 refuses.
 *
 * So `code` is NOT in `BUILT_IN_ACTIVITY_KINDS`. The base dispatcher answers
 * "no, ask the host" for it, which `external-consumer/run.mjs` asserts from
 * outside, and this module is the only way in:
 *
 *   import { ActivityProvider, ActivityRenderer } from '@iterahq/activities';
 *   import { CodeActivity } from '@iterahq/activities/code';
 *
 *   <ActivityProvider
 *     i18n={createActivityI18n('pt')}
 *     codeEditor={MyMonacoAdapter}      // optional — omit for a plain textarea
 *     storage={myDraftStore}            // optional — omit for localStorage
 *     renderers={{ code: CodeActivity }}
 *   >
 *     <ActivityRenderer activity={row} onComplete={(correct, detail) => …} />
 *   </ActivityProvider>
 *
 * `renderers` is the seam the package already had for kinds it does not ship
 * (`ActivityHostContext.renderers`) — registering `code` through it is not a
 * special case, it is the general case with a component that happens to come
 * from the same package.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ THE PREVIEW NEEDS THREE HOST-SERVED FILES
 * ═════════════════════════════════════════════════════════════════════════════
 * The preview iframe is a self-contained document that loads
 * `/vendor/react.production.min.js`, `/vendor/react-dom.production.min.js` and
 * `/vendor/tailwind-play-cdn.js` from the HOST's origin — absolute paths, no
 * CDN, by design (student code runs in an opaque-origin sandbox and nothing may
 * be fetched from the network at runtime). A consumer that does not serve those
 * three files gets an editor, a working submit, and an empty preview.
 *
 * This is the `code` twin of the Tailwind-tokens gap in the base README: a real
 * host requirement that no test in this repo can fail on, so it is written down
 * where someone will read it. See README.md → "Consuming the /code entrypoint".
 */

export { CodeActivity } from './CodeActivity.js';
export { CodeSnackPane } from './CodeSnackPane.js';
export { CodeLivePreview } from './CodeLivePreview.js';
export { CodeChecksFeedback } from './CodeChecksFeedback.js';
export { CodeChecksList } from './CodeChecksList.js';
export { CodeResetControl } from './CodeResetControl.js';
export { CodeEditorSurface, FallbackCodeEditor } from './CodeEditorSurface.js';

export { useCodeSnack } from './useCodeSnack.js';
export { useCodeChecks } from './useCodeChecks.js';

export { transpileSnack } from './transpileSnack.js';
export { CODE_PREVIEW_IFRAME_HTML } from './codePreviewIframe.js';
export {
  CODE_PREVIEW_RUNTIME_SOURCE,
  createRequireShim,
  installPreviewDialogShims,
  runCodeChecks,
} from './codePreviewRuntime.js';

/**
 * The draft-key contract. A host adapter needs BOTH: the prefix to recognise
 * the key as this kind's, and the constructor so a test can assert where a
 * draft landed. See `./draftKey.ts` for why this is public at all.
 */
export {
  CODE_DRAFT_KEY_PREFIX,
  codeDraftActivityId,
  codeDraftKey,
} from './draftKey.js';

export type {
  CodeCheckResult,
  CodeChecksRequest,
  CodeSnackPhase,
  TranspileResult,
  UseCodeSnackCallbacks,
} from './types.js';
export type { ActivityCodeEditorProps } from '../ports.js';
