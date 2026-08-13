/**
 * WHICH COMPONENT OWNS THIS LINE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE FILE NAME IS NOT THE ANSWER
 * ═══════════════════════════════════════════════════════════════════════════
 * `scripts/source-stamp.ts` writes `data-source="<file>:<line>"`. The capture
 * harness (`e2e/support/captureRegions.ts`) turns that into a region record,
 * and a region record wants a COMPONENT NAME — the thing a designer says out
 * loud ("the sidebar", "the verdict footer") rather than a path.
 *
 * Deriving that name from the file's basename is the cheap option and it is
 * wrong often enough to matter. `src/pages/auth/LoginPage.tsx` is four lines
 * long and renders `<AuthPage />`; every stamp a login screenshot carries names
 * `AuthPage.tsx`, and a basename derivation would answer "AuthPage" for all of
 * them — which is right by accident. But `src/pages/auth/AuthPage.tsx` also
 * holds more than one component, and a file like `Foo/index.tsx` has no name in
 * its basename at all. The basename answers a question about the FILE. The
 * question is about the LINE.
 *
 * So this module parses the file and reports the innermost enclosing declaration
 * whose name looks like a React component (capitalised). `typescript` is already
 * a devDependency and `ts.createSourceFile` is a pure function — no program, no
 * type-checker, no disk — the same reasoning that picked it for the stamp.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT "LOOKS LIKE A COMPONENT" MEANS, AND WHY IT WALKS OUTWARD
 * ═══════════════════════════════════════════════════════════════════════════
 * JSX inside a component is routinely nested in a lowercase helper — a `map`
 * callback, a `renderRow()`, a `useMemo`. The INNERMOST named function at a
 * given line is therefore frequently the helper, and the helper is not the
 * answer a designer can use. The walk collects every enclosing named
 * declaration and takes the innermost CAPITALISED one, so a helper is skipped
 * and its owning component is reported.
 *
 * When nothing capitalised encloses the line — a bare JSX constant at module
 * scope, say — the fallback is the file's own identity, and `index.tsx` falls
 * back one directory further because `index` names nothing.
 *
 * The fallback is a real answer, not a failure: it is still the file a designer
 * would open. It is separated only so a caller can tell the two apart.
 */
import path from "node:path";
import ts from "typescript";

/** A React component name starts with a capital letter. That is the whole rule. */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * The name a declaration carries, or `undefined` for anonymous ones.
 *
 * `const Foo = () => …` puts the name on the VariableDeclaration, not on the
 * arrow function, so the arrow itself is skipped and its parent is read instead.
 */
function declarationName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const init = node.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
      return node.name.text;
    }
    // `const Card = memo(function Card() {…})` / `forwardRef(…)` — the JSX is
    // inside a call argument, and the binding is still the component's name.
    if (init && ts.isCallExpression(init)) return node.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return undefined;
}

export interface ComponentAtLine {
  /** The reported name. Never empty. */
  name: string;
  /** `true` when it came from an enclosing declaration, `false` from the path. */
  fromDeclaration: boolean;
}

/**
 * The file-shaped fallback: `Foo.tsx` -> `Foo`, `Foo/index.tsx` -> `Foo`.
 *
 * Exported because the capture harness needs it when a file cannot be read at
 * all (a stamp naming a deleted file), where there is no AST to consult.
 */
export function componentNameFromPath(relPath: string): string {
  const base = path.basename(relPath).replace(/\.[jt]sx?$/, "");
  if (base !== "index") return base;
  const dir = path.basename(path.dirname(relPath));
  return dir && dir !== "." ? dir : "index";
}

/**
 * The component that encloses `line` (1-based) in `code`.
 *
 * Pure: same input, same output, no I/O. `relPath` is used only for the
 * fallback name and for the synthetic source-file name.
 */
export function componentAtLine(code: string, line: number, relPath: string): ComponentAtLine {
  const fallback: ComponentAtLine = { name: componentNameFromPath(relPath), fromDeclaration: false };
  if (!Number.isInteger(line) || line < 1) return fallback;

  const source = ts.createSourceFile(
    relPath,
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX
  );

  const lineCount = source.getLineStarts().length;
  if (line > lineCount) return fallback;
  const target = source.getPositionOfLineAndCharacter(line - 1, 0);

  // Every named declaration whose span contains the target, outermost first.
  const enclosing: string[] = [];

  const visit = (node: ts.Node): void => {
    const start = node.getStart(source);
    if (target < start || target > node.end) return;
    const name = declarationName(node);
    if (name) enclosing.push(name);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  // Innermost capitalised wins: a lowercase `renderRow` helper is skipped in
  // favour of the component that owns it.
  for (let i = enclosing.length - 1; i >= 0; i -= 1) {
    if (isComponentName(enclosing[i])) {
      return { name: enclosing[i], fromDeclaration: true };
    }
  }

  return fallback;
}
