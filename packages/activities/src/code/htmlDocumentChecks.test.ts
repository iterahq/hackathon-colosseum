import { describe, expect, it } from 'vitest';
import type { CodeCheck } from '@iterahq/activity-spec';
import { runHtmlChecksInDocument } from './htmlDocumentChecks.js';

/**
 * `runHtmlChecksInDocument` — the pure vitest/jsdom helper a content fixture
 * uses to grade an authored html snack WITHOUT a sandboxed iframe. It shares
 * `runCodeChecks` with the real preview (`codePreviewRuntime.html.test.ts`
 * exercises the browser-facing half), so this file is about the ONE thing that
 * genuinely differs: `DOMParser` never executes `<script>`.
 */

const check = (over: Partial<CodeCheck> & Pick<CodeCheck, 'selector' | 'assert'>): CodeCheck => ({
  id: over.id ?? 'c1',
  label: over.label ?? 'check',
  ...over,
});

describe('runHtmlChecksInDocument', () => {
  it('grades static structure: html[lang], head > title, body h1', async () => {
    const source = [
      '<!doctype html>',
      '<html lang="pt-BR">',
      '<head><title>Minha página</title></head>',
      '<body><h1>Bem-vinda</h1></body>',
      '</html>',
    ].join('');

    const results = await runHtmlChecksInDocument(source, [
      check({ id: 'lang', selector: 'html[lang="pt-BR"]', assert: { type: 'exists' } }),
      check({ id: 'title', selector: 'head > title', assert: { type: 'text', equals: 'Minha página' } }),
      check({ id: 'h1', selector: 'body h1', assert: { type: 'text', equals: 'Bem-vinda' } }),
    ]);

    expect(results).toEqual([
      { id: 'lang', passed: true },
      { id: 'title', passed: true },
      { id: 'h1', passed: true },
    ]);
  });

  it('a missing/wrong attribute fails like it does in the real preview', async () => {
    const source = '<!doctype html><html><head></head><body></body></html>';
    const results = await runHtmlChecksInDocument(source, [
      check({ selector: 'html[lang]', assert: { type: 'exists' } }),
    ]);
    expect(results).toEqual([{ id: 'c1', passed: false }]);
  });

  it('does NOT execute inline <script> — a script-driven check reads as unsolved', async () => {
    // If this script ran, #out would say "Clicado!" without any interaction —
    // exactly the false positive this helper's docblock warns about.
    const source = [
      '<!doctype html><html><head></head><body>',
      '<button id="btn">Clique</button><p id="out"></p>',
      '<script>document.getElementById("out").textContent = "Clicado!";</script>',
      '</body></html>',
    ].join('');

    const results = await runHtmlChecksInDocument(source, [
      check({ selector: '#out', assert: { type: 'text', equals: 'Clicado!' } }),
    ]);
    expect(results).toEqual([{ id: 'c1', passed: false }]);
  });

  it('static class/attr checks still grade real hand-authored markup', async () => {
    const source =
      '<!doctype html><html><head></head><body><button class="btn btn-primary" disabled>Enviar</button></body></html>';

    const results = await runHtmlChecksInDocument(source, [
      check({ id: 'classe', selector: 'button', assert: { type: 'class', contains: 'btn-primary' } }),
      check({ id: 'atributo', selector: 'button', assert: { type: 'attr', name: 'disabled', equals: '' } }),
    ]);
    expect(results).toEqual([
      { id: 'classe', passed: true },
      { id: 'atributo', passed: true },
    ]);
  });
});
