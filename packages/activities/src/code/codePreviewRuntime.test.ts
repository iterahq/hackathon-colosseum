import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  sourceClosesTags,
  sourceHasTag,
  type CodeCheck,
  type SourceHasTag,
} from '@iterahq/activity-spec';
import { CODE_PREVIEW_HTML_CHECK_RUNTIME_SOURCE, runCodeChecks } from './codePreviewRuntime.js';
import { buildHtmlCheckDocument } from './codePreviewIframe.js';
import { runHtmlChecksInDocument } from './htmlDocumentChecks.js';

/**
 * The `style`, `closes` and `source_has` asserts, run through the SAME
 * `runCodeChecks` the preview iframe runs. `closes`/`source_has` read the
 * learner's source; `style` reads computed style from the parsed document.
 */

const check = (over: Partial<CodeCheck> & Pick<CodeCheck, 'selector' | 'assert'>): CodeCheck => ({
  id: over.id ?? 'c1',
  label: over.label ?? 'check',
  ...over,
});

async function passed(source: string, c: CodeCheck): Promise<boolean> {
  const [result] = await runHtmlChecksInDocument(source, [c]);
  return result.passed;
}

const ENFORCED = 'h1,h2,h3,p,li,ul,ol,strong,em,a';
const closes = (selector = ENFORCED) => check({ selector, assert: { type: 'closes' } });

describe('runCodeChecks — closes', () => {
  it('passes correct markup in any spacing / formatting', async () => {
    const variants = [
      '<h2>Sobre mim</h2><ul><li><strong>ano</strong></li></ul>',
      '<h2 >Sobre mim</h2 >\n<ul>\n  <li>\n    <strong>ano</strong>\n  </li>\n</ul>',
      '<H2 CLASS="t">Sobre mim</h2><UL><LI><STRONG>ano</STRONG></LI></UL>',
    ];
    for (const src of variants) expect(await passed(src, closes()), src).toBe(true);
  });

  it('fails <h2>…</h3>, which the DOM repairs into a valid h2', async () => {
    const src = '<h2>Sobre mim</h3>';
    // The regression this exists for: a DOM check cannot see the mistake.
    expect(await passed(src, check({ selector: 'h3', assert: { type: 'count', equals: 0 } }))).toBe(
      true,
    );
    expect(await passed(src, closes())).toBe(false);
  });

  it('fails <li><strong>x</li>', async () => {
    expect(await passed('<ul><li><strong>ano</li></ul>', closes())).toBe(false);
  });

  it('ignores comments, doctype and void tags', async () => {
    const src =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="icon" href="a.png"></head>' +
      '<body><!-- <h2>rascunho</h3> --><p>foto <img src="a.png"> <br> <input> <hr></p></body></html>';
    expect(await passed(src, closes('*'))).toBe(true);
  });

  it('fails when there is no source to read (React path) instead of passing vacuously', async () => {
    document.body.innerHTML = '<h2>x</h2>';
    const [r] = await runCodeChecks({
      root: document.body,
      checks: [closes()],
      remount: () => {},
      nextTick: () => Promise.resolve(),
      win: window,
    });
    expect(r.passed).toBe(false);
  });
});

describe('runCodeChecks — source_has', () => {
  const has = (tag: SourceHasTag) => check({ selector: tag, assert: { type: 'source_has', tag } });
  const full =
    '<!doctype html>\n<html lang="pt-BR">\n<head><title>t</title></head>\n<body><h1>oi</h1></body>\n</html>';

  it('finds the whole skeleton in a full document', async () => {
    for (const tag of ['doctype', 'html', 'head', 'body'] as const) {
      expect(await passed(full, has(tag)), tag).toBe(true);
    }
  });

  it('misses the skeleton of a fragment even though the parser synthesises it', async () => {
    const fragment = '<h1>oi</h1>';
    expect(await passed(fragment, check({ selector: 'body', assert: { type: 'exists' } }))).toBe(
      true,
    );
    for (const tag of ['doctype', 'html', 'head', 'body'] as const) {
      expect(await passed(fragment, has(tag)), tag).toBe(false);
    }
  });
});

describe('runCodeChecks — style', () => {
  const style = (selector: string, property: string, equals: string) =>
    check({ selector, assert: { type: 'style', property, equals } });
  const page = (css: string, body: string) =>
    `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`;

  it('reads the computed colour: tomato is rgb(255, 99, 71), however it was written', async () => {
    for (const css of ['h1{color:tomato}', 'h1 { color: #ff6347; }', 'h1{color:rgb(255,99,71)}']) {
      const src = page(css, '<h1>oi</h1>');
      expect(await passed(src, style('h1', 'color', 'rgb(255, 99, 71)')), css).toBe(true);
    }
  });

  it('resolves a named colour the author wrote in `equals` through the browser', async () => {
    const src = page('body{background-color:#ffc0cb}', '<h1>oi</h1>');
    expect(await passed(src, style('body', 'background-color', 'pink'))).toBe(true);
    expect(await passed(src, style('body', 'background-color', 'rgb(255, 192, 203)'))).toBe(true);
    expect(await passed(src, style('body', 'background-color', 'tomato'))).toBe(false);
  });

  it('checks 40px and center regardless of how the rule is spaced', async () => {
    for (const css of ['h1{font-size:40px;text-align:center}', 'h1 {\n  font-size: 40px ;\n  text-align:   center\n}']) {
      const src = page(css, '<h1>oi</h1>');
      expect(await passed(src, style('h1', 'font-size', '40px')), css).toBe(true);
      expect(await passed(src, style('h1', 'text-align', 'center')), css).toBe(true);
    }
    const wrong = page('h1{font-size:32px;text-align:left}', '<h1>oi</h1>');
    expect(await passed(wrong, style('h1', 'font-size', '40px'))).toBe(false);
    expect(await passed(wrong, style('h1', 'text-align', 'center'))).toBe(false);
  });

  it('a declaration the browser dropped (missing `;`) does not pass', async () => {
    const src = page('.menu { display: flex color: red; }', '<nav class="menu">m</nav>');
    expect(await passed(src, style('.menu', 'display', 'flex'))).toBe(false);
  });

  it('requires EVERY matched element to satisfy it', async () => {
    const src = page('li{color:tomato} li.x{color:blue}', '<ul><li>a</li><li class="x">b</li></ul>');
    expect(await passed(src, style('li', 'color', 'rgb(255, 99, 71)'))).toBe(false);
    expect(await passed(src, style('li:not(.x)', 'color', 'rgb(255, 99, 71)'))).toBe(true);
  });

  it('fails on zero matches', async () => {
    const src = page('h1{font-size:40px}', '<p>sem título</p>');
    expect(await passed(src, style('h1', 'font-size', '40px'))).toBe(false);
  });

  it('`contains` is a substring of the computed value', async () => {
    const src = page('p{font-family:"Arial", sans-serif}', '<p>x</p>');
    expect(
      await passed(src, check({ selector: 'p', assert: { type: 'style', property: 'font-family', contains: 'Arial' } })),
    ).toBe(true);
  });

  it('leaves no probe element behind', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const doc = frame.contentDocument as Document;
    const parsed = new DOMParser().parseFromString(page('body{background-color:#ffc0cb}', '<p>x</p>'), 'text/html');
    doc.replaceChild(doc.adoptNode(parsed.documentElement), doc.documentElement);
    const [r] = await runCodeChecks({
      root: doc,
      checks: [style('body', 'background-color', 'pink')],
      remount: () => {},
      nextTick: () => Promise.resolve(),
      win: frame.contentWindow as Window,
    });
    expect(r.passed).toBe(true);
    expect(doc.querySelector('itera-style-probe')).toBeNull();
    frame.remove();
  });
});

describe('runCodeChecks — old asserts unchanged', () => {
  it('exists / count / text / class / attr grade exactly as before', async () => {
    const src = '<button class="px-4 bg-emerald-500" type="submit">Enviar</button>';
    const cases: [CodeCheck['assert'], boolean][] = [
      [{ type: 'exists' }, true],
      [{ type: 'count', equals: 1 }, true],
      [{ type: 'text', equals: 'enviar' }, true],
      [{ type: 'class', contains: 'bg-emerald' }, true],
      [{ type: 'class', equals: 'bg-emerald-500 px-4' }, true],
      [{ type: 'class', equals: 'bg-emerald-500' }, false],
      [{ type: 'attr', name: 'type', equals: 'submit' }, true],
      [{ type: 'attr', name: 'type', equals: 'button' }, false],
    ];
    for (const [assert, want] of cases) {
      expect(await passed(src, check({ selector: 'button', assert })), JSON.stringify(assert)).toBe(want);
    }
  });
});

/**
 * The runtime's tokenizer is an INLINE copy (it is serialised into the iframe
 * and cannot import). This pins it to `@iterahq/activity-spec`'s own functions
 * over the cases that distinguish a correct tokenizer from a naive one.
 */
describe('parity with @iterahq/activity-spec', () => {
  const corpus = [
    '<h2>Sobre mim</h2>',
    '<h2>Sobre mim</h3>',
    '<ul><li><strong>ano</li></ul>',
    '<p><em>x</p></em>',
    '<p>x',
    '<p>x</p></p>',
    '<!-- <p> --><p>ok</p>',
    '<!-- unterminated <p>',
    '<!DOCTYPE html><html><head><meta charset=utf-8></head><body></body></html>',
    '<a title="a > b" href=\'/x\'>l</a>',
    '<script>if (a<b) x = "</p>"</script><p>ok</p>',
    '<style>p > a { color: red }</style><p>ok</p>',
    '<title><p></title><textarea><li></textarea>',
    '<svg><path d="M0 0"/></svg>',
    '<P>x</p><BR/><Br>',
    '<p>1 < 2</p>',
    '<header>x</header>',
    '<!doctype   HTML><HEAD></HEAD><Body class=x>',
  ];
  const selectors = ['*', 'h2', 'h2,h3', 'li,strong', 'p, em', 'svg,path'];

  function runtimeVerdicts(source: string, checks: CodeCheck[]) {
    return runHtmlChecksInDocument(source, checks).then((r) => r.map((x) => x.passed));
  }

  it('closes agrees with sourceClosesTags', async () => {
    for (const src of corpus) {
      const checks = selectors.map((selector, i) => check({ id: 'c' + i, selector, assert: { type: 'closes' } }));
      const want = selectors.map((selector) => sourceClosesTags(src, selector));
      expect(await runtimeVerdicts(src, checks), src).toEqual(want);
    }
  });

  it('source_has agrees with sourceHasTag', async () => {
    const tags = ['doctype', 'html', 'head', 'body'] as const;
    for (const src of corpus) {
      const checks = tags.map((tag) => check({ id: tag, selector: tag, assert: { type: 'source_has', tag } }));
      const want = tags.map((tag) => sourceHasTag(src, tag));
      expect(await runtimeVerdicts(src, checks), src).toEqual(want);
    }
  });
});

/**
 * The real grading document: the source is serialised into it, so the
 * source asserts must see the learner's text, not the parser's repair.
 */
describe('buildHtmlCheckDocument — source asserts in a fresh realm', () => {
  it('grades closes / source_has from the serialised source', async () => {
    const source = '<!doctype html><html><head></head><body><h2>Sobre mim</h3></body></html>';
    const checks = [
      closes('h2,h3'),
      check({ id: 'c2', selector: 'doctype', assert: { type: 'source_has', tag: 'doctype' } }),
    ];
    expect(CODE_PREVIEW_HTML_CHECK_RUNTIME_SOURCE).toContain('__iteraRunChecks');
    const dom = new JSDOM(buildHtmlCheckDocument(source, checks), {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: 'https://learner.example/',
    });
    const data = await new Promise<{ results: unknown }>((resolve) => {
      dom.window.addEventListener('message', (e: MessageEvent) => resolve(e.data));
    });
    expect(data.results).toEqual([
      { id: 'c1', passed: false },
      { id: 'c2', passed: true },
    ]);
  });
});
