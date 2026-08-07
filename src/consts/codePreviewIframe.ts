/**
 * MOVED — the preview iframe document now lives in `@iterahq/activities/code`
 * (Fase C, step 5).
 *
 * ⚠️ It still loads `/vendor/react.production.min.js`,
 * `/vendor/react-dom.production.min.js` and `/vendor/tailwind-play-cdn.js` from
 * the HOST's origin. In this repo those are `public/vendor/` assets; in any
 * other consumer they are a setup step, documented in the package README.
 */
export { CODE_PREVIEW_IFRAME_HTML } from '@iterahq/activities/code';
