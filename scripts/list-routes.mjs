#!/usr/bin/env node
/**
 * Prints the routes this app actually serves, one per line, on stdout.
 *
 * It is the route extractor for the ux-paths guard (`.github/workflows/ux-paths.yml`),
 * which compares this output with the `screen.route` set declared in
 * `.dfl-ux-paths/flows.json`. A route in the code that no screen declares means
 * the app grew and the map did not; a declared route the code no longer serves
 * means the map describes something that is gone. Both fail the build.
 *
 * ## Why an AST walk and not a grep
 *
 * A `grep 'path="'` gets 27 of the 31 routes and is wrong about the other four
 * in two different ways, each of which produces a WRONG answer rather than a
 * missing one:
 *
 *   - The six `/admin` children are declared with **relative** paths
 *     (`path="roster"`), so a grep reports `roster` where the app serves
 *     `/admin/roster`. That is six false "undeclared route" failures and six
 *     false "stale screen" failures in the same run.
 *   - `<Route path={GUEST_ROUTE_PATH} …>` is an **identifier**, not a literal.
 *     A grep skips it silently, so the guard would never notice `/g/:code`
 *     disappearing.
 *
 * The AST walk resolves nesting by construction and resolves the identifier by
 * reading the module it is imported from.
 *
 * ## It refuses rather than guesses
 *
 * Every failure here is a hard exit with a message naming the file and the
 * construct. A route extractor that returns a partial list on a construct it
 * does not understand is worse than no extractor: the guard would compare a
 * short list against the full declaration and blame the map for the tool's blind
 * spot. If this exits non-zero, the answer is to teach it the construct — never
 * to drop the route.
 *
 * Usage:  node scripts/list-routes.mjs [--source src/App.tsx]
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// `UX_PATHS_TS_DIR` lets CI resolve TypeScript from a throwaway directory
// instead of from this repo's `node_modules`. That is not a convenience: a full
// `npm ci` here installs ~625 packages and needs a GitHub Packages token for the
// `@iterahq` scope, and making a blocking gate depend on both is how a gate ends
// up permanently red for reasons that have nothing to do with the map. The
// extractor needs exactly one package — the compiler's JSX parser — and the
// route table it reads does not vary with the compiler's patch version.
// Unset (a developer running it locally), it resolves from the repo as usual.
const require = createRequire(
  process.env.UX_PATHS_TS_DIR
    ? path.join(process.env.UX_PATHS_TS_DIR, "noop.cjs")
    : import.meta.url,
);
const ts = require("typescript");

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/** Exits with a located explanation. Never returns a partial answer. */
function refuse(message) {
  console.error(`list-routes: ${message}`);
  process.exit(1);
}

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** `<Route …>` and `<Route … />` both carry their attributes here. */
function openingOf(node) {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

function tagNameOf(node) {
  const opening = openingOf(node);
  return opening ? opening.tagName.getText() : null;
}

function attributeOf(node, name) {
  const opening = openingOf(node);
  if (!opening) return undefined;
  for (const attr of opening.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText() === name) return attr;
  }
  return undefined;
}

/**
 * Resolves an identifier used as a route path to its string value, by reading
 * the module it is imported from.
 *
 * Deliberately narrow: it follows ONE import hop and accepts only
 * `export const NAME = "<literal>"`. Anything else — a computed value, a
 * re-export chain, a template string — is refused by name. Widening this is a
 * decision someone should make on purpose, having seen the construct.
 */
function resolveImportedConstant(sourceFile, name, sourcePath) {
  let specifier = null;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.name.getText() === name) specifier = statement.moduleSpecifier.text;
    }
  }
  if (!specifier) {
    refuse(
      `<Route path={${name}}> in ${sourcePath}: ${name} is not a named import of that file, ` +
        `so its value cannot be read. Teach this script the construct rather than dropping the route.`,
    );
  }

  const base = specifier.startsWith(".")
    ? path.resolve(path.dirname(sourcePath), specifier)
    : specifier.startsWith("@/")
      ? path.resolve(REPO_ROOT, "src", specifier.slice(2))
      : null;
  if (!base) {
    refuse(`<Route path={${name}}> imports from "${specifier}", which is not a path this script can resolve.`);
  }

  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) {
    refuse(`<Route path={${name}}> imports from "${specifier}", which resolves to no file (tried: ${candidates.join(", ")}).`);
  }

  const module = parse(file);
  for (const statement of module.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = (statement.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText() !== name) continue;
      let initializer = declaration.initializer;
      // `= '/g/:code' as const` wraps the literal in an assertion.
      if (initializer && ts.isAsExpression(initializer)) initializer = initializer.expression;
      if (initializer && ts.isStringLiteral(initializer)) return initializer.text;
      refuse(
        `${name} is exported from ${path.relative(REPO_ROOT, file)} but is not a plain string literal. ` +
          `This script reads only \`export const ${name} = "<literal>"\`.`,
      );
    }
  }
  refuse(`${name} is imported from ${path.relative(REPO_ROOT, file)} but that file exports no such const.`);
}

/** The `path` attribute of one `<Route>`, as a string. `null` = an index route. */
function routePathOf(node, sourceFile, sourcePath) {
  const attribute = attributeOf(node, "path");
  if (!attribute) {
    // `<Route index element={…} />` addresses the parent's own path, which the
    // parent already emits. Nothing new to report.
    if (attributeOf(node, "index")) return null;
    refuse(`a <Route> in ${sourcePath} has neither a \`path\` nor an \`index\` attribute.`);
  }

  const value = attribute.initializer;
  if (value && ts.isStringLiteral(value)) return value.text;
  if (value && ts.isJsxExpression(value) && value.expression) {
    const expression = value.expression;
    if (ts.isStringLiteral(expression)) return expression.text;
    if (ts.isIdentifier(expression)) {
      return resolveImportedConstant(sourceFile, expression.getText(), sourcePath);
    }
    refuse(
      `<Route path={…}> in ${sourcePath} uses an expression this script cannot evaluate: ` +
        `\`${expression.getText()}\`. Teach it the construct rather than dropping the route.`,
    );
  }
  refuse(`a <Route> in ${sourcePath} has a \`path\` this script cannot read.`);
}

/** React-Router semantics: a child path is relative unless it starts with `/`. */
function joinRoute(parent, child) {
  if (child.startsWith("/")) return child;
  if (child === "*") return parent === "" ? "/*" : `${parent}/*`;
  const prefix = parent === "" ? "" : parent.replace(/\/$/, "");
  return `${prefix}/${child}`;
}

function collect(node, parent, sourceFile, sourcePath, out) {
  for (const child of node.children ?? []) {
    if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) continue;
    if (tagNameOf(child) !== "Route") continue;

    const own = routePathOf(child, sourceFile, sourcePath);
    const full = own === null ? parent : joinRoute(parent, own);
    if (own !== null) out.add(full);
    if (ts.isJsxElement(child)) collect(child, full, sourceFile, sourcePath, out);
  }
}

function main() {
  const argv = process.argv.slice(2);
  let source = "src/App.tsx";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source") {
      source = argv[i + 1];
      i += 1;
    } else {
      refuse(`unknown argument: ${argv[i]}`);
    }
  }

  const sourcePath = path.resolve(REPO_ROOT, source);
  if (!fs.existsSync(sourcePath)) refuse(`${source} does not exist.`);
  const sourceFile = parse(sourcePath);

  const routesElements = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && tagNameOf(node) === "Routes") routesElements.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (routesElements.length === 0) {
    refuse(
      `no <Routes> element in ${source}. The route table moved, and this script would otherwise ` +
        `report an empty list — which the guard reads as "every declared route is stale".`,
    );
  }

  const out = new Set();
  for (const element of routesElements) collect(element, "", sourceFile, sourcePath, out);

  if (out.size === 0) refuse(`<Routes> in ${source} contains no <Route> children.`);

  for (const route of [...out].sort()) console.log(route);
}

main();
