/**
 * "No subscription or sign-up surface inside the native shell" (plan 20261003-itera-player-mobile,
 * row W-7; Q-3, Q-11), as pure functions over source text. `shell-commerce.test.ts` runs them
 * against the real tree and against negative fixtures.
 *
 * A HIT is a place in product code that can put commerce in front of a learner:
 *   - `route`   a string that names `/subscribe` or `/signup` (a link, a redirect, a route path);
 *   - `stripe`  a string or identifier that names Stripe, a checkout or the billing portal;
 *   - `wording` an i18n key whose pt or en text carries subscription, price or sign-up wording,
 *               or such wording written straight into the source.
 * Every file with a hit must be on the closed list of the test, with the gate that keeps it out of
 * the shell; each gate is then checked against the source, not taken on trust.
 *
 * This is a TRIPWIRE for the known vocabulary and routes, not a proof. It does not see a path
 * built from pieces (`'/sub' + 'scribe'`), a key built in a template, or an offer worded outside
 * the list; the walk of a real build with both kinds of account stays the check (row R-14).
 */
import ts from "typescript";

export interface Sources {
  paths: readonly string[];
  read(file: string): string;
}

export type HitKind = "route" | "stripe" | "wording";

export interface Hit {
  file: string;
  kind: HitKind;
  text: string;
  line: number;
  /** True when a `<WebOnly>` element encloses the hit. */
  insideWebOnly: boolean;
}

export type Gate =
  /** Every hit of the file sits inside `<WebOnly>`. */
  | { gate: "web-only" }
  /** The file branches on `useShellSurface()` itself; its hit count is closed, so a new one is a visible edit. */
  | { gate: "surface-branch"; hits: number }
  /** A page mounted in `src/App.tsx` only inside `<WebOnlyRoute>`. */
  | { gate: "web-only-route"; page: string }
  /** A page mounted in `src/App.tsx` only inside `<RequireSubscription>`: in the shell an account without access never reaches it. */
  | { gate: "behind-access-gate"; page: string }
  /** No surface of its own: every file that names one of `symbols` is on the list too, or names it inside `<WebOnly>`. */
  | { gate: "reached-through"; symbols: readonly string[] }
  /** Data only (a type, a query key, a row mapper): a `.ts` file with no route and no dictionary key, so it can show nothing. */
  | { gate: "no-surface" }
  /** `src/App.tsx`: every `<Route>` that names a commerce path or page is wrapped in `<WebOnlyRoute>`. */
  | { gate: "router" };

export const APP_FILE = "src/App.tsx";
export const DICTIONARY_FILE = "src/i18n/index.ts";

const ROUTE = /\/(subscribe|signup)(?![A-Za-z0-9_-])/;
/** A payment provider, or a path that sells: no whitespace needed, a bare URL is a hit. */
const STRIPE_TEXT =
  /stripe|\b(hotmart|kiwify|eduzz|monetizze|pagar\.me|pagseguro|mercadopago|paypal|paddle|lemonsqueezy|gumroad)\b|\/(pricing|precos|planos|assinar|checkout|upgrade|billing)(?![A-Za-z0-9_-])/i;
/**
 * Identifiers of the billing code. `checkout` alone is not one: this product teaches git, so
 * `checkoutBranch` must pass; only the names the billing code really uses are listed.
 */
const STRIPE_IDENTIFIER = /stripe|billing|pricing|cancel(subscription|atperiodend)|(create|use)checkout|checkout(_?url|request|response|activation|session)/i;
/**
 * Wording a learner would read as an offer, in both dictionary languages. Tight on purpose where a
 * lesson uses the same word: "git checkout", "plano de estudos", "cadastro de usuários",
 * "trial and error" are not commerce.
 */
export const WORDING = new RegExp(
  [
    "assin(e|ar|atura|ante)",
    "\\bplanos?\\b(?! de (estudos?|aulas?|fundo|ação|trabalho|testes?|voo|ensino|curso)| cartesiano)",
    "preço",
    "R\\$",
    "cri(ar|e) (a |sua |minha )?conta",
    "cadastr(e-se|ar-se|e (sua|a) conta|ar (sua|uma) conta|o gr[aá]tis)|fa(ça|zer) (o |seu )?cadastro|etapas do cadastro",
    "pagamento",
    "cobran",
    "cartão de crédito|credit card",
    "mensalidade",
    "\\bcompr(e|ar)\\b",
    "subscri",
    "\\bpric(e|ing)\\b",
    "free trial|trial (period|gratuito)|teste gr[aá]tis",
    "sign(ed)? ?up\\b",
    "create (your |an )?account",
    "\\bpayment",
    "\\bbilling\\b",
    "\\b(purchase|buy now|upgrade|premium)\\b",
    "checkout (de |do |da )?(pagamento|assinatura|compra)|(pagamento|payment|stripe|redirecting to|ir para o|finalizar o?) ?checkout",
    "stripe",
  ].join("|"),
  "i",
);
/** A one-word label that sells by itself: `<a>Assinar</a>`, a button that says "Upgrade". */
const WORDING_SINGLE = /^(assin(e|ar|atura|ante)s?|subscribe|subscription|upgrade|premium|compr(e|ar)|pricing|preços?|mensalidade|cadastre-se|sign ?up)$/i;
/**
 * The reviewed exit for a WORDING hit that is not commerce (lesson copy about a payment domain): a
 * real comment `// not-commerce: <reason>` (or a block / JSX comment) that ends on the line of the
 * hit or on the single line above it. It never clears a route, a payment host or a Stripe hit, and
 * the same text inside a string is not a marker. Each marker is counted per file, and the test pins
 * that count in a closed map, so adding one is a visible edit of the guard.
 */
const NOT_COMMERCE = /not-commerce:\s*\S/;
const SCAN_ROOTS = ["src/", "packages/activities/src/", "packages/screens/src/", "packages/core/src/"];
const KEY_SHAPE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

export function isProductSource(file: string): boolean {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".d.ts")) return false;
  if (!SCAN_ROOTS.some((root) => file.startsWith(root))) return false;
  if (/\.(test|spec|stories|testkit)\.(ts|tsx)$/.test(file)) return false;
  if (/^src\/(test|test-utils|stories)\//.test(file)) return false;
  return file !== DICTIONARY_FILE;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** The i18n keys whose text, in any language of the dictionary, carries commerce wording. */
export function wordedKeys(dictionarySource: string): string[] {
  const keys = new Set<string>();
  const source = parse(DICTIONARY_FILE, dictionarySource);
  const cleared = clearedLines(source, dictionarySource);
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isStringLiteralLike(node.name) &&
      KEY_SHAPE.test(node.name.text) &&
      !cleared(source.getLineAndCharacterOfPosition(node.getStart(source)).line)
    ) {
      const value = node.initializer;
      const text = ts.isStringLiteralLike(value) || ts.isTemplateExpression(value) ? value.getText() : "";
      if (WORDING.test(text) || /^(subscribe|subscription)\./.test(node.name.text)) keys.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...keys].sort();
}

/** The (0-based) line each `not-commerce:` COMMENT of the file ends on. A string with that text is not one. */
function markerLines(source: ts.SourceFile, text: string): number[] {
  if (!text.includes("not-commerce:")) return [];
  const seen = new Map<number, number>();
  const take = (ranges: ts.CommentRange[] | undefined) => {
    for (const r of ranges ?? []) {
      if (!seen.has(r.pos) && NOT_COMMERCE.test(text.slice(r.pos, r.end))) seen.set(r.pos, source.getLineAndCharacterOfPosition(r.end).line);
    }
  };
  const jsxText: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push(node);
      return;
    }
    take(ts.getLeadingCommentRanges(text, node.getFullStart()));
    take(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  // `//` written in JSX text is text: the trivia scan after `<p>` cannot know that.
  return [...seen].filter(([pos]) => !jsxText.some((t) => pos >= t.getFullStart() && pos < t.getEnd())).map(([, line]) => line);
}

/** How many `not-commerce:` markers a file carries. */
export function markerCount(file: string, text: string): number {
  return markerLines(parse(file, text), text).length;
}

/** True for a (0-based) line a marker ends on, or the single line after it. */
function clearedLines(source: ts.SourceFile, text: string): (line: number) => boolean {
  const lines = new Set(markerLines(source, text));
  return (line) => lines.has(line) || lines.has(line - 1);
}

function insideWebOnly(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === "WebOnly") return true;
  }
  return false;
}

export function hitsOf(file: string, text: string, worded: ReadonlySet<string>): Hit[] {
  const source = parse(file, text);
  const hits: Hit[] = [];
  const cleared = clearedLines(source, text);
  const add = (node: ts.Node, kind: HitKind, value: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
    if (kind === "wording" && cleared(line)) return;
    hits.push({ file, kind, text: value.trim().slice(0, 60), line: line + 1, insideWebOnly: insideWebOnly(node) });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    const literal =
      ts.isStringLiteralLike(node) || ts.isJsxText(node)
        ? node.text
        : ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
          ? node.text
          : null;
    if (literal !== null) {
      if (ROUTE.test(literal)) add(node, "route", literal);
      else if (STRIPE_TEXT.test(literal)) add(node, "stripe", literal);
      else if (worded.has(literal)) add(node, "wording", literal);
      else if (!KEY_SHAPE.test(literal) && /\s/.test(literal.trim()) && WORDING.test(literal)) add(node, "wording", literal);
      else if (WORDING_SINGLE.test(literal.trim()) && (ts.isJsxText(node) || /^\p{Lu}/u.test(literal.trim()))) add(node, "wording", literal);
    } else if (ts.isIdentifier(node) && STRIPE_IDENTIFIER.test(node.text)) {
      add(node, "stripe", node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

export function scan(repo: Sources): Hit[] {
  const worded = new Set(wordedKeys(repo.read(DICTIONARY_FILE)));
  return repo.paths.filter(isProductSource).flatMap((file) => hitsOf(file, repo.read(file), worded));
}

/** The identifiers a file uses outside `<WebOnly>`; an import or a re-export alone is not a use. */
function identifiersOf(file: string, text: string): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "WebOnly") return;
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parse(file, text));
  return names;
}

/** The `<Route …>` elements of `src/App.tsx`, as source text, comments removed. */
function routeElements(appSource: string): string[] {
  const source = parse(APP_FILE, appSource);
  const routes: string[] = [];
  const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening && opening.tagName.getText() === "Route") {
      const hasChildRoutes = ts.isJsxElement(node) && node.children.some((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
      routes.push(strip(hasChildRoutes ? opening.getText() : node.getText()));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return routes;
}

function wrappedBy(route: string, wrapper: string, page: string): boolean {
  return new RegExp(`<${wrapper}[\\s>](?:(?!</${wrapper}>)[\\s\\S])*<${page}[\\s/>]`).test(route);
}

/**
 * Every way the tree breaks the rule, as readable lines. Empty = the rule holds.
 * `gated` is the closed list of the test; `markers` its closed map of `not-commerce:` markers per file.
 */
export function violations(repo: Sources, gated: Readonly<Record<string, Gate>>, markers: Readonly<Record<string, number>> = {}): string[] {
  const out: string[] = [];
  for (const file of repo.paths) {
    if (!isProductSource(file) && file !== DICTIONARY_FILE) continue;
    const found = markerCount(file, repo.read(file));
    const pinned = markers[file] ?? 0;
    if (found !== pinned) out.push(`${file} carries ${found} not-commerce marker(s), NOT_COMMERCE_MARKERS says ${pinned}: pin the count in scripts/shell-commerce.test.ts`);
  }
  for (const file of Object.keys(markers)) {
    if (!repo.paths.includes(file)) out.push(`${file} is in NOT_COMMERCE_MARKERS and is not in the tree: remove it`);
  }
  const hits = scan(repo);
  const byFile = new Map<string, Hit[]>();
  for (const h of hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);

  for (const [file, list] of byFile) {
    if (!gated[file]) {
      out.push(
        `${file}:${list[0].line} is not on the closed list (${list[0].kind}: ${list[0].text}). Commerce: gate it and list the file. Wording that is not commerce: comment "// not-commerce: <reason>" on that line or the line above, and pin it in NOT_COMMERCE_MARKERS`,
      );
    }
  }
  for (const file of Object.keys(gated)) {
    if (!byFile.has(file)) out.push(`${file} is on the closed list and has no hit: remove it`);
  }

  const routes = repo.paths.includes(APP_FILE) ? routeElements(repo.read(APP_FILE)) : [];
  const webOnlyPages = Object.values(gated).flatMap((g) => (g.gate === "web-only-route" ? [g.page] : []));
  const sourceFiles = repo.paths.filter(isProductSource);
  const names = new Map<string, Set<string>>();
  const namesOf = (file: string) => names.get(file) ?? names.set(file, identifiersOf(file, repo.read(file))).get(file)!;

  for (const [file, entry] of Object.entries(gated)) {
    const list = byFile.get(file) ?? [];
    const text = repo.paths.includes(file) ? repo.read(file) : "";
    switch (entry.gate) {
      case "web-only":
        for (const h of list) if (!h.insideWebOnly) out.push(`${file}:${h.line} is outside <WebOnly> (${h.kind}: ${h.text})`);
        break;
      case "surface-branch":
        if (!/\buseShellSurface\(\)/.test(text)) out.push(`${file} does not read useShellSurface()`);
        if (list.length !== entry.hits) out.push(`${file} has ${list.length} hits, the list says ${entry.hits}`);
        break;
      case "web-only-route":
      case "behind-access-gate": {
        const wrapper = entry.gate === "web-only-route" ? "WebOnlyRoute" : "RequireSubscription";
        const mounts = routes.filter((r) => new RegExp(`<${entry.page}[\\s/>]`).test(r));
        if (mounts.length === 0) out.push(`${file}: no <Route> of ${APP_FILE} mounts <${entry.page} />`);
        for (const r of mounts) if (!wrappedBy(r, wrapper, entry.page)) out.push(`${file}: <${entry.page} /> is mounted outside <${wrapper}>`);
        break;
      }
      case "reached-through":
        for (const other of sourceFiles) {
          if (other === file || gated[other]) continue;
          const used = entry.symbols.find((s) => namesOf(other).has(s));
          if (used) out.push(`${other} names ${used} of ${file} and is not on the closed list`);
        }
        break;
      case "no-surface":
        if (!file.endsWith(".ts")) out.push(`${file} is not a .ts file: it can render`);
        for (const h of list) if (h.kind !== "stripe") out.push(`${file}:${h.line} carries a ${h.kind} hit (${h.text}): it is not data only`);
        break;
      case "router":
        for (const r of routes) {
          const commerce = ROUTE.test(r) || webOnlyPages.some((p) => new RegExp(`<${p}[\\s/>]`).test(r));
          if (commerce && !/<WebOnlyRoute>/.test(r)) out.push(`${file}: a commerce <Route> is not wrapped in <WebOnlyRoute>: ${r.slice(0, 80).replace(/\s+/g, " ")}`);
        }
        break;
    }
  }
  return out.sort();
}
