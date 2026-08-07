/**
 * MOVED — the light-markdown parser now lives in `@iterahq/activities`
 * (Fase C, step 1: pure logic).
 *
 * It travelled because the RENDERERS of its output travelled: `RichText`,
 * `RichBlock` and `RichSpans` are in the package now, and a parser whose only
 * consumers are on the other side of a package boundary belongs on that side.
 * This file remains so `@/utils/richText` keeps resolving for the app's
 * sandbox/terminal trees and for `src/test/richText.test.ts`.
 */
export { parseInline, parseRichText } from '@iterahq/activities';
export type { Block, Inline } from '@iterahq/activities';
