import type { CodeCheck } from '@iterahq/activity-spec';
import { runCodeChecks } from './codePreviewRuntime.js';
import type { CodeCheckResult } from './types.js';

/**
 * A pure, browser/jsdom test helper for the `language: 'html'` half of the
 * `code` kind: parse `source` (a full HTML document) with `DOMParser` and run
 * `checks` against it with `runCodeChecks` — the SAME grading function the
 * preview iframe runs, just against a document `DOMParser` built instead of
 * one a browser rendered.
 *
 * ⚠️ SCRIPTS ARE NOT EXECUTED. `DOMParser.parseFromString` never runs
 * `<script>` content (per spec — this is exactly why it is safe to call
 * outside a sandbox), so a check whose correctness depends on JS having
 * already mutated the DOM (a click handler that toggles a class, a counter
 * that increments) will not see that behaviour here and reads as if the
 * learner never wrote the script at all. Static checks — `html[lang]`,
 * `head > title`, a class on a hand-authored element — grade exactly like the
 * real preview, because they never depended on script execution in the first
 * place. A `steps` check that depends on a script side effect belongs in a
 * real browser (`CodeLivePreview` / an e2e), not in this helper.
 *
 * Unlike the iframe runtime in `./codePreviewRuntime.ts`, this function does
 * NOT need to be `String(fn)`-serialisable — it runs in the test process, not
 * inside the sandboxed preview — so it is free to import normally.
 */
export function runHtmlChecksInDocument(
  source: string,
  checks: CodeCheck[],
): Promise<CodeCheckResult[]> {
  const parse = () => new DOMParser().parseFromString(source, 'text/html');
  const doc = parse();

  function remount(): void {
    const fresh = parse();
    doc.replaceChild(doc.adoptNode(fresh.documentElement), doc.documentElement);
  }

  return runCodeChecks({
    root: doc,
    checks,
    remount,
    nextTick: () => Promise.resolve(),
    win: window,
  });
}
