import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import type { CodeCheck } from '@iterahq/activity-spec';
import { buildHtmlCheckDocument, buildHtmlPreviewDocument } from './codePreviewIframe.js';

/**
 * The blocker this file guards against: an EARLIER version of the `code`
 * kind's `language: 'html'` preview re-rendered the learner's document
 * IN PLACE inside one long-lived iframe — same `window`/`document` across
 * every keystroke and every graded run. For arbitrary learner JavaScript that
 * is wrong two ways: a top-level `let`/`const`/`class` throws "Identifier has
 * already been declared" the SECOND time its script runs, and a listener
 * attached to `document`/`window` (unlike one on a specific element, which
 * dies with `innerHTML`) ACCUMULATES one more handler per render — a click
 * step then fires N times instead of once.
 *
 * `buildHtmlPreviewDocument`/`buildHtmlCheckDocument` fix this by construction:
 * each call returns a COMPLETE, independent document string, and
 * `CodeLivePreview` sets it as the iframe's entire `srcDoc` on every render —
 * a real navigation, which the browser gives a genuinely NEW realm. This file
 * proves that property directly with the REAL `jsdom` package (`runScripts:
 * 'dangerously'`), instantiating a SEPARATE `JSDOM` per "render" exactly the
 * way separate navigations of the same iframe element behave — unlike the
 * single shared `window`/`document` vitest's own jsdom environment provides
 * for the rest of this repo's tests, which cannot exercise "fresh realm"
 * because there is only ever one realm in that environment.
 */

function freshRealm(html: string) {
  return new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://learner.example/' });
}

const check = (over: Partial<CodeCheck> & Pick<CodeCheck, 'selector' | 'assert'>): CodeCheck => ({
  id: over.id ?? 'c1',
  label: over.label ?? 'check',
  ...over,
});

describe('buildHtmlPreviewDocument — a fresh realm per render', () => {
  it('a top-level `let` survives TWO renders and a run-checks — no redeclaration', async () => {
    const source = [
      '<!doctype html><html><head></head><body>',
      '<p id="out">0</p>',
      '<script>let count = 0; document.getElementById("out").textContent = String(count);</script>',
      '</body></html>',
    ].join('');

    // Render 1 (first keystroke).
    const render1 = freshRealm(buildHtmlPreviewDocument(source));
    expect(render1.window.document.getElementById('out')?.textContent).toBe('0');

    // Render 2 (next keystroke) — the SAME `let count` re-declared. In the
    // in-place design this was the SAME realm and threw; here it is a brand
    // new one and must not.
    const render2 = freshRealm(buildHtmlPreviewDocument(source));
    expect(render2.window.document.getElementById('out')?.textContent).toBe('0');

    // A submit right after — the graded document ALSO gets its own realm.
    const checks: CodeCheck[] = [check({ selector: '#out', assert: { type: 'text', equals: '0' } })];
    const runDoc = freshRealm(buildHtmlCheckDocument(source, checks));
    const results = await new Promise((resolve) => {
      runDoc.window.addEventListener('message', (e: MessageEvent) => resolve(e.data));
    });
    expect(results).toEqual({ type: 'itera:checks', results: [{ id: 'c1', passed: true }] });
  });

  it('a click listener fires exactly once per click, even after several renders', () => {
    const source = [
      '<!doctype html><html><head></head><body>',
      '<button id="btn">+1</button>',
      '<p id="count">0</p>',
      '<script>',
      'var n = 0;',
      // Deliberately a DOCUMENT-level (delegated) listener, not one on the
      // button itself — this is the exact shape that used to accumulate,
      // because `document` (unlike the button, replaced by `innerHTML` on
      // every in-place re-render) survived across renders in the old design.
      'document.addEventListener("click", function (e) {',
      '  if (e.target && e.target.id === "btn") {',
      '    n += 1;',
      '    document.getElementById("count").textContent = String(n);',
      '  }',
      '});',
      '</script>',
      '</body></html>',
    ].join('');

    // Simulate three renders (three keystrokes) — three INDEPENDENT realms,
    // each re-running the script above.
    freshRealm(buildHtmlPreviewDocument(source));
    freshRealm(buildHtmlPreviewDocument(source));
    const latest = freshRealm(buildHtmlPreviewDocument(source));

    // Click ONCE on the latest realm only.
    const btn = latest.window.document.getElementById('btn') as HTMLButtonElement;
    btn.dispatchEvent(new latest.window.MouseEvent('click', { bubbles: true }));

    // Exactly one handler fired — a realm that had accumulated the earlier
    // renders' listeners would read "3" here instead of "1".
    expect(latest.window.document.getElementById('count')?.textContent).toBe('1');
  });
});

describe('buildHtmlPreviewDocument — says when the page draws nothing', () => {
  const readyOf = (source: string) =>
    new Promise<{ type: string; empty?: boolean }>((resolve) => {
      const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'dangerously', url: 'https://learner.example/' });
      dom.window.addEventListener('message', (e: MessageEvent) => resolve(e.data));
      dom.window.document.open();
      dom.window.document.write(buildHtmlPreviewDocument(source));
      dom.window.document.close();
    });

  it('a script that only logs leaves an empty page', async () => {
    expect(await readyOf("<script>const hora = 9; console.log(hora < 12);</script>")).toEqual({ type: 'itera:ready', empty: true });
  });

  it('an empty list waiting for a click is still an empty page', async () => {
    expect((await readyOf('<ul id="lista"></ul><style>ul { color: red; }</style>')).empty).toBe(true);
  });

  it('text written by the script counts as drawn', async () => {
    const source = '<p id="s"></p><script>document.querySelector("#s").textContent = "Olá, Bia";</script>';
    expect((await readyOf(source)).empty).toBe(false);
  });

  it('a button with no text around it counts as drawn', async () => {
    expect((await readyOf('<form><input id="meta"></form>')).empty).toBe(false);
  });
});

describe('buildHtmlCheckDocument — isolation across STEPPED checks', () => {
  it('two stepped checks graded in SEPARATE realms do not contaminate each other', async () => {
    // A counter script identical to the one above — the exact shape that,
    // graded as two stepped checks sharing ONE realm, would read "2" on the
    // second check instead of "1" (the listener already fired once for the
    // first check's click).
    const source = [
      '<!doctype html><html><head></head><body>',
      '<button id="btn">+1</button>',
      '<p id="count">0</p>',
      '<script>',
      'var n = 0;',
      'document.getElementById("btn").addEventListener("click", function () {',
      '  n += 1;',
      '  document.getElementById("count").textContent = String(n);',
      '});',
      '</script>',
      '</body></html>',
    ].join('');

    const oneClickCheck = (id: string) =>
      check({
        id,
        selector: '#count',
        steps: [{ do: 'click', selector: '#btn' }],
        assert: { type: 'text', equals: '1' },
      });

    // Graded exactly the way `gradeHtml` grades a STEPPED check: one fresh
    // document per check.
    for (const id of ['primeiro', 'segundo']) {
      const runDoc = freshRealm(buildHtmlCheckDocument(source, [oneClickCheck(id)]));
      const data = await new Promise<{ results: { id: string; passed: boolean }[] }>((resolve) => {
        runDoc.window.addEventListener('message', (e: MessageEvent) => resolve(e.data));
      });
      expect(data.results).toEqual([{ id, passed: true }]);
    }
  });
});

describe('buildHtmlCheckDocument — author-controlled check text stays inside its <script>', () => {
  // A check may legitimately quote markup: the text a learner's page should
  // show, a selector on a script tag. Inlined raw, `</script>` ended the
  // grading script early and `<!--` re-moded it, so nothing was ever posted.
  const source = '<!doctype html><html><head></head><body><p id="t">a &lt;/script&gt; &lt;!-- b</p></body></html>';

  it('grades a check whose text and label contain `</script>` and `<!--`', async () => {
    const checks: CodeCheck[] = [
      check({
        id: 'markup',
        label: 'shows </script><img src=x> and <!-- a comment',
        selector: '#t',
        assert: { type: 'text', equals: 'a </script> <!-- b' },
      }),
    ];

    const runDoc = freshRealm(buildHtmlCheckDocument(source, checks));
    const data = await new Promise((resolve) => {
      runDoc.window.addEventListener('message', (e: MessageEvent) => resolve(e.data));
    });
    expect(data).toEqual({ type: 'itera:checks', results: [{ id: 'markup', passed: true }] });
  });

  it('never writes a raw `</script` or `<!--` from a check into the document', () => {
    const checks: CodeCheck[] = [
      check({ label: '</script><!--', selector: '#t', assert: { type: 'exists' } }),
    ];
    const doc = buildHtmlCheckDocument(source, checks);
    const afterSource = doc.slice(source.length);
    // The only `</script>` left is the one closing OUR script element.
    expect(afterSource.match(/<\/script/gi)).toHaveLength(1);
    expect(afterSource).not.toContain('<!--');
    expect(afterSource).toContain('\\u003c/script>\\u003c!--');
  });
});
