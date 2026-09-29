import { describe, expect, it } from 'vitest';
import { buildCssPreviewDocument, buildCssSampleBody, extractCssSelectors } from './cssPreviewDocument.js';

const bodyDoc = (css: string) => new DOMParser().parseFromString(buildCssPreviewDocument(css), 'text/html');

describe('extractCssSelectors', () => {
  it('reads every rule, splits selector lists and skips at-rule preludes', () => {
    const css = '/* card */ .cartao { padding: 16px; }\nh1, p { color: red; }\n@media (max-width: 600px) {\n  .menu { flex-direction: column; }\n}\n';
    expect(extractCssSelectors(css)).toEqual(['.cartao', 'h1', 'p', '.menu']);
  });

  it('drops duplicates', () => {
    expect(extractCssSelectors('img { width: 1px; } img { max-width: 100%; }')).toEqual(['img']);
  });
});

describe('buildCssPreviewDocument', () => {
  it('wraps the learner stylesheet in a <style> over a page, never a script', () => {
    const doc = bodyDoc('.cartao { padding: 16px; }');
    const styles = [...doc.querySelectorAll('style')].map((s) => s.textContent);
    expect(styles.some((s) => s?.includes('.cartao { padding: 16px; }'))).toBe(true);
    expect(doc.querySelector('script')).toBeNull();
  });

  it('draws one element each rule styles, so the rule is visible', () => {
    const doc = bodyDoc('.cartao { padding: 16px; }\nimg { max-width: 100%; }\nh1 { color: red; }');
    expect(doc.querySelector('.cartao')).not.toBeNull();
    expect(doc.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(doc.querySelector('h1')?.textContent).toBe('h1');
  });

  it('gives a layout container children, so flex and gap show', () => {
    const doc = bodyDoc('.menu { display: flex; gap: 16px; }');
    expect(doc.querySelector('.menu')?.children.length).toBe(3);
  });

  it('nests descendant selectors and puts list items inside a list', () => {
    const doc = bodyDoc('nav .menu li { color: red; }');
    expect(doc.querySelector('nav > ul.menu > li')).not.toBeNull();
    expect(bodyDoc('li { color: red; }').querySelector('ul > li')).not.toBeNull();
  });

  it('keeps ids and classes of a compound selector', () => {
    expect(bodyDoc('p#saudacao.destaque:hover { color: red; }').querySelector('p#saudacao.destaque')).not.toBeNull();
  });

  it('falls back to a small sample when no rule names an element', () => {
    expect(buildCssSampleBody('body { margin: 0; }')).toContain('<h1>');
    expect(buildCssSampleBody('')).toContain('<p>');
  });

  it('cannot be closed early by a </style> in the learner text', () => {
    const doc = bodyDoc('p { color: red; } </style><script>alert(1)</script>');
    expect(doc.querySelector('script')).toBeNull();
  });
});
