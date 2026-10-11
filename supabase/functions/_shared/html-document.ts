import { load } from 'npm:cheerio@1.0.0';
import type { HtmlDocument } from './grading.ts';

/** A full HTML document parsed by the HTML5 algorithm (parse5), without running scripts or loading anything. */
export function parseHtmlDocument(source: string): HtmlDocument {
  const $ = load(source);
  return {
    count: (selector) => $(selector).length,
    text: (selector) => {
      const first = $(selector).first();
      return first.length === 0 ? null : first.text();
    },
    attr: (selector, name) => $(selector).first().attr(name) ?? null,
  };
}
