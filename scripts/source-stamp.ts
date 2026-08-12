/**
 * `data-source` BUILD STAMP — the source half of the UX map.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT DOES
 * ═══════════════════════════════════════════════════════════════════════════
 * A Vite plugin. It writes `data-source="src/pages/HomePage.tsx:42"` onto every
 * HOST element (`<div>`, `<button>`, `<svg>` …) that our own `.tsx` files write.
 * The value is the repository-relative path of the file, and the line of the
 * opening tag.
 *
 * The consumer is the capture harness of plan
 * `20260812-ux-map-observed-reality-lens` (P4). It screenshots a screen, reads
 * each element box with `agent-browser get box`, and stores the box beside the
 * file path. A designer then clicks a REGION of a screenshot and gets the exact
 * file. No model call. No repository clone on his side. The same technique Mews
 * published to measure design-system adoption, applied to a second purpose.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚨 CAPTURE BUILDS ONLY — AND THE GATE IS AN ENV VAR ON PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 * The stamp must never reach production. Two independent reasons:
 *
 *  1. **Weight.** One attribute per host element, on every element of every
 *     screen. It is dead payload for a learner.
 *  2. **Disclosure.** `itera-player` is a PRIVATE repository. The stamp prints
 *     its internal file layout into the DOM, where anyone who opens dev tools
 *     reads it.
 *
 * ⚠️ **`mode !== "production"` would FAIL OPEN, which is why it is not used.**
 * A capture build IS a production-mode build: the harness runs `vite build`,
 * because the artifact under capture has to be the artifact that ships, minus
 * this stamp. So a test on the mode is true exactly when we need the stamp AND
 * true for the real release — it cannot separate them. `componentTagger()` two
 * lines below in `vite.config.ts` is gated that way and is correct to be: it is
 * a DEV-server tool that never wants a build at all. This is the opposite case.
 *
 * The gate is therefore `ITERA_SOURCE_STAMP` in the process environment, which
 * is **absent unless somebody sets it**. `process.env` — never `loadEnv` — so a
 * committed `.env` file cannot turn it on. The default is off, and the default
 * is asserted twice: by `scripts/source-stamp.test.ts` on the gate function,
 * and by `scripts/assert-no-source-stamp.mjs` on the BUILT ARTIFACT in CI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT ATTRIBUTED, AND WHY THAT IS CORRECT
 * ═══════════════════════════════════════════════════════════════════════════
 *  - **Third-party components.** Radix, `recharts`, `sonner` and friends emit
 *    their own DOM from their own compiled JS. Vite never sees their JSX.
 *  - **`packages/activities`.** The workspace package is compiled to `dist/` by
 *    `tsc` BEFORE Vite runs, so its JSX is already `jsx()` calls. It is our
 *    code, and it is still unattributed. Chasing it means changing that
 *    package's build; out of scope here, and recorded so nobody reads a gap as
 *    a bug.
 *  - **`React.createElement` and `dangerouslySetInnerHTML`.** No JSX tag, no
 *    stamp.
 *
 * A region that lands on unattributed DOM resolves through its nearest STAMPED
 * ancestor, which is the file that mounted the third-party component. That is
 * the honest answer, and it is the one a designer can act on.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO IMPLEMENTATION CHOICES WORTH THE INK
 * ═══════════════════════════════════════════════════════════════════════════
 * **The parser is `typescript`, not a regex and not SWC.** `typescript` is
 * already a devDependency, so this adds no dependency. It gives exact spans and
 * exact line numbers for TSX, and `ts.createSourceFile` is a pure function —
 * no program, no type-checker, no disk. SWC was the other candidate; its
 * `parseSync` spans carry a process-global byte offset that must be rebased per
 * file, which is a footgun for no gain here.
 *
 * **The stamp is inserted FIRST among the attributes, and the plugin never adds
 * a line.** First means a hand-written `data-source` or a later `{...props}`
 * spread WINS over the stamp — real code beats the machine. Never adding a line
 * is what makes `map: null` honest: every line of the transformed file is still
 * the line it was, so the source map that the React transform builds downstream
 * stays right about lines. `scripts/source-stamp.test.ts` asserts that
 * invariant, so it cannot rot into a lie.
 */
import path from "node:path";
import ts from "typescript";
import type { Plugin } from "vite";

/** The attribute this plugin writes. `assert-no-source-stamp.mjs` greps for it. */
export const SOURCE_STAMP_ATTR = "data-source";

/** The one and only switch. Absent = off. */
export const SOURCE_STAMP_ENV = "ITERA_SOURCE_STAMP";

/** Accepted "on" spellings. Everything else — including `0` and `""` — is off. */
const ON_VALUES = new Set(["1", "true", "on", "yes"]);

/**
 * The gate, as a pure function of an environment, so that "the default is safe"
 * is a unit test instead of a claim. Note what it does NOT read: `mode`,
 * `NODE_ENV`, `command`, or any `.env` file.
 */
export function isSourceStampEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[SOURCE_STAMP_ENV];
  if (typeof raw !== "string") return false;
  return ON_VALUES.has(raw.trim().toLowerCase());
}

/** `<div>` is a host element; `<Button>` and `<Foo.Bar>` are components. */
function isHostTagName(name: string): boolean {
  return /^[a-z]/.test(name);
}

/** Somebody already wrote `data-source` by hand — leave it alone. */
function hasExplicitStamp(attributes: ts.JsxAttributes): boolean {
  return attributes.properties.some(
    (prop) =>
      ts.isJsxAttribute(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === SOURCE_STAMP_ATTR
  );
}

export interface StampResult {
  code: string;
  /** How many opening tags received the attribute. */
  stamped: number;
}

/**
 * Insert the stamp into one TSX source. Pure: same input, same output, no I/O.
 *
 * `relPath` is written into the attribute verbatim, so the caller owns the
 * "repository-relative, posix separators" contract.
 */
export function stampSource(code: string, relPath: string): StampResult {
  const source = ts.createSourceFile(
    relPath,
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX
  );

  const edits: { at: number; text: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      // `ts.isIdentifier` also excludes `<Foo.Bar>` (PropertyAccessExpression)
      // and `<a:b>` (JsxNamespacedName), neither of which is a host element.
      if (ts.isIdentifier(tag) && isHostTagName(tag.text) && !hasExplicitStamp(node.attributes)) {
        // `getStart(source)` and not `tag.pos`: `pos` starts at the leading
        // trivia, so `<{/* c */ div}` style spacing would report the wrong
        // line. The source file argument is required because the tree is built
        // without parent pointers.
        const start = tag.getStart(source);
        const line = source.getLineAndCharacterOfPosition(start).line + 1;
        edits.push({ at: tag.end, text: ` ${SOURCE_STAMP_ATTR}="${relPath}:${line}"` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (edits.length === 0) return { code, stamped: 0 };

  // Descending, so an earlier insertion never moves a later offset.
  edits.sort((a, b) => b.at - a.at);
  let out = code;
  for (const edit of edits) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
  }
  return { code: out, stamped: edits.length };
}

export interface SourceStampOptions {
  /** Repository root. Attribute paths are relative to it. */
  root: string;
  /** Injected for testing. Defaults to the real process environment. */
  env?: NodeJS.ProcessEnv;
}

/**
 * The Vite plugin — or `undefined` when the switch is off, which is the default.
 *
 * `enforce: "pre"` puts it ahead of `@vitejs/plugin-react-swc`, so it edits raw
 * TSX and hands ordinary TSX on. Nothing downstream knows it ran.
 */
export function sourceStamp(options: SourceStampOptions): Plugin | undefined {
  const env = options.env ?? process.env;
  if (!isSourceStampEnabled(env)) return undefined;

  const root = options.root;
  let stampedElements = 0;
  let stampedFiles = 0;

  return {
    name: "itera:source-stamp",
    enforce: "pre",

    configResolved() {
      console.warn(
        `\n[source-stamp] ENABLED by ${SOURCE_STAMP_ENV}. Every host element gets ` +
          `${SOURCE_STAMP_ATTR}="<file>:<line>".\n` +
          `[source-stamp] This build exposes the repository layout. Use it for capture. ` +
          `DO NOT DEPLOY IT.\n`
      );
    },

    transform(code, id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".tsx")) return null;
      if (file.includes("/node_modules/")) return null;

      const rel = path.relative(root, file);
      // Outside the repository — nothing we can name a path for.
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;

      const relPosix = rel.split(path.sep).join("/");
      const result = stampSource(code, relPosix);
      if (result.stamped === 0) return null;

      stampedElements += result.stamped;
      stampedFiles += 1;
      // `map: null` = "no map from me, keep the chain". Sound only because the
      // transform never adds or removes a line. See the header.
      return { code: result.code, map: null };
    },

    buildEnd() {
      console.warn(
        `[source-stamp] stamped ${stampedElements} elements across ${stampedFiles} files`
      );
    },
  };
}
