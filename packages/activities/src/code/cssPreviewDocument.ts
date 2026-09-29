/**
 * `language: 'css'` has no page of its own: the learner writes a stylesheet,
 * and a stylesheet alone draws nothing. The spec carries no HTML for it, so the
 * preview builds a tiny neutral page out of the stylesheet's own selectors —
 * one element per rule — and wraps the learner CSS in a `<style>` over it.
 * The result is a plain HTML document, rendered by the `'html'` preview.
 */

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input']);
const LIST_TAGS = new Set(['ul', 'ol']);
const DOCUMENT_TAGS = new Set(['html', 'body', 'head', '*', ':root']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'span', 'strong', 'em', 'label']);

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='200'%3E%3Crect width='480' height='200' fill='%23cbd5e1'/%3E%3C/svg%3E";

const FALLBACK_BODY = '<h1>Aa</h1>\n<p>Lorem ipsum dolor sit amet.</p>\n<a href="#">link</a>';

const BASE_STYLE = 'body { margin: 16px; font-family: system-ui, sans-serif; color: #111; background: #fff; }';

interface Compound {
  tag?: string;
  id?: string;
  classes: string[];
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** `ul.menu#main:hover` → `{ tag: 'ul', id: 'main', classes: ['menu'] }`. Pseudo parts and attribute selectors are dropped. */
function parseCompound(raw: string): Compound | null {
  const cleaned = raw.replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
  const match = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/.exec(cleaned);
  if (!match) return null;
  const compound: Compound = { tag: match[1]?.toLowerCase(), classes: [] };
  for (const part of match[2].match(/[.#][\w-]+/g) ?? []) {
    if (part.startsWith('#')) compound.id = part.slice(1);
    else compound.classes.push(part.slice(1));
  }
  if (!compound.tag && !compound.id && compound.classes.length === 0) return null;
  return compound;
}

/** Every selector (one per list entry) of every style rule, skipping at-rule preludes. */
export function extractCssSelectors(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors: string[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(/([^{};]*)\{/g)) {
    const prelude = match[1].trim();
    if (!prelude || prelude.startsWith('@')) continue;
    for (const entry of prelude.split(',')) {
      const selector = entry.trim().replace(/\s+/g, ' ');
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      selectors.push(selector);
    }
  }
  return selectors;
}

function openTag(tag: string, compound: Compound): string {
  const attrs = [
    compound.id ? ` id="${escapeAttr(compound.id)}"` : '',
    compound.classes.length > 0 ? ` class="${escapeAttr(compound.classes.join(' '))}"` : '',
  ].join('');
  return `<${tag}${attrs}>`;
}

/** The innermost element of a selector: what the rule actually styles, with enough content to show it. */
function leafElement(compound: Compound, label: string): string {
  const tag = compound.tag && compound.tag !== '*' ? compound.tag : 'div';
  if (tag === 'img') return `${openTag('img', compound).slice(0, -1)} src="${PLACEHOLDER_IMAGE}" alt="">`;
  if (VOID_TAGS.has(tag)) return openTag(tag, compound);
  if (LIST_TAGS.has(tag)) return `${openTag(tag, compound)}<li>1</li><li>2</li><li>3</li></${tag}>`;
  if (tag === 'li') return `${openTag('li', compound)}${label}</li><li>${label}</li>`;
  if (TEXT_TAGS.has(tag)) return `${openTag(tag, compound)}${label}</${tag}>`;
  // A container: three children, so layout rules (flex, gap, direction) are visible too.
  return `${openTag(tag, compound)}<span>A</span> <span>B</span> <span>C</span></${tag}>`;
}

/** One selector as nested markup: `nav .menu li` → `<nav><div class="menu"><ul><li>…` . */
function elementFor(selector: string): string | null {
  const parts = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const compounds = parts.map(parseCompound);
  if (compounds.length === 0 || compounds.some((c) => c === null)) return null;
  const chain = compounds as Compound[];
  if (chain.length === 1 && chain[0].tag && DOCUMENT_TAGS.has(chain[0].tag) && !chain[0].id && chain[0].classes.length === 0) {
    return null;
  }
  const label = escapeAttr(selector);
  const leaf = chain[chain.length - 1];
  let html = leafElement(leaf, label);
  // A list item needs a list around it: the parent in the selector when it has no tag of its own, else a bare `<ul>`.
  const itemsNeedList = leaf.tag === 'li';
  for (let i = chain.length - 2; i >= 0; i -= 1) {
    const outer = chain[i];
    const fallback = itemsNeedList && i === chain.length - 2 ? 'ul' : 'div';
    const tag = outer.tag && !DOCUMENT_TAGS.has(outer.tag) ? outer.tag : fallback;
    html = `${openTag(tag, outer)}${html}</${tag}>`;
  }
  return itemsNeedList && chain.length === 1 ? `<ul>${html}</ul>` : html;
}

/** The sample page for a stylesheet: one element per selector, or a small generic page when none can be drawn. */
export function buildCssSampleBody(css: string): string {
  const elements = extractCssSelectors(css)
    .map(elementFor)
    .filter((html): html is string => html !== null);
  return elements.length > 0 ? elements.join('\n') : FALLBACK_BODY;
}

/** The learner stylesheet over its sample page, as one HTML document. */
export function buildCssPreviewDocument(css: string): string {
  // `</style` inside the learner text would close the tag early; break it the way a browser would never read as markup.
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<style>${BASE_STYLE}</style>`,
    `<style>\n${safeCss}\n</style>`,
    '</head>',
    '<body>',
    buildCssSampleBody(css),
    '</body>',
    '</html>',
  ].join('\n');
}
