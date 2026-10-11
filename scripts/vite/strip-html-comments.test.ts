import { describe, expect, it } from "vitest";
import { stripHtmlComments } from "./strip-html-comments";

describe("stripHtmlComments", () => {
  it("drops HTML comments and keeps the markup around them", () => {
    const html = '<head>\n    <!--\n      Fontes da marca (ADR-12/ADR-14)\n    -->\n    <link rel="preload" href="/a.woff2">\n</head>';
    expect(stripHtmlComments(html)).toBe('<head>\n    <link rel="preload" href="/a.woff2">\n</head>');
  });

  it("drops line and block comments inside inline scripts without touching urls or strings", () => {
    const html = "<script>\n  // restore randomUUID\n  var base = 'https://x.supabase.co';\n  try { a(); } catch (e) {\n    /* locked by SES */\n  }\n</script>";
    expect(stripHtmlComments(html)).toBe("<script>\n  var base = 'https://x.supabase.co';\n  try { a(); } catch (e) {\n  }\n</script>");
  });

  it("leaves external scripts alone", () => {
    const html = '<script type="module" crossorigin src="/assets/index-abc.js"></script>';
    expect(stripHtmlComments(html)).toBe(html);
  });
});
