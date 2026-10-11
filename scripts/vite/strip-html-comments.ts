import type { Plugin } from "vite";

const HTML_COMMENT = /<!--[\s\S]*?-->\s*/g;
const INLINE_SCRIPT = /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^[ \t]*\/\/.*(?:\r?\n|$)/gm;
const BLANK_LINES = /\n[ \t]*\n+/g;

/** The served HTML carries no developer notes: `<!-- -->` blocks and the comments inside inline scripts are dropped at build. */
export function stripHtmlComments(html: string): string {
  return html
    .replace(HTML_COMMENT, "")
    .replace(INLINE_SCRIPT, (_match, open: string, body: string, close: string) => `${open}${body.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "").replace(BLANK_LINES, "\n")}${close}`);
}

export function stripHtmlCommentsPlugin(): Plugin {
  return {
    name: "itera:strip-html-comments",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => stripHtmlComments(html) },
  };
}
