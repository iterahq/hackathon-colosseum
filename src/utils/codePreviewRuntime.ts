/**
 * MOVED — the preview iframe's runtime now lives in `@iterahq/activities/code`
 * (Fase C, step 5). `src/test/codePreviewRuntime.test.tsx` keeps resolving it
 * through this path, which is the point: the serialised-into-the-iframe
 * functions are the least portable thing in the kind and they kept their tests.
 */
export {
  CODE_PREVIEW_RUNTIME_SOURCE,
  createRequireShim,
  installPreviewDialogShims,
  runCodeChecks,
} from '@iterahq/activities/code';
