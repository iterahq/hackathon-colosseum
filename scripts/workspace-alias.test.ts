// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Docker build runs `npm ci` before `COPY . .`, so the workspace symlink of a package under
 * `packages/` points at nothing while Vite resolves imports. A package that ships a build
 * (`exports` -> `dist/`) is fine because the build step produces it first; a source-only package
 * (`exports` -> `src/`) has nothing to resolve through, so `vite.config.ts` must alias every
 * subpath the app imports. CI stayed green and the image failed once (#573 -> #577).
 */

type PackageJson = {
  name?: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: unknown;
};

type WorkspacePackage = { dir: string; json: PackageJson };
type AliasEntry = { key: string; target: string };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function exportTargets(json: PackageJson): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const strings = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (value && typeof value === "object") return Object.values(value).flatMap(strings);
    return [];
  };
  if (json.exports && typeof json.exports === "object" && Object.keys(json.exports).every((k) => k.startsWith("."))) {
    for (const [subpath, value] of Object.entries(json.exports)) out.set(subpath, strings(value));
  } else if (json.exports) {
    out.set(".", strings(json.exports));
  } else {
    out.set(".", [json.module, json.main, json.types].filter((v): v is string => typeof v === "string"));
  }
  return out;
}

const isCode = (target: string) => /\.(?:[cm]?[jt]sx?)$/.test(target);
const normalize = (target: string) => posix.normalize(target.replace(/^\.\//, ""));

export function isSourceOnly(json: PackageJson): boolean {
  const code = [...exportTargets(json).values()].flat().filter(isCode).map(normalize);
  return code.length > 0 && code.every((t) => t.startsWith("src/"));
}

/** The file a subpath's import resolves to: the first non-declaration target, relative to the package. */
function entryFor(targets: string[]): string | undefined {
  return targets.map(normalize).find((t) => !t.endsWith(".d.ts")) ?? targets.map(normalize)[0];
}

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bvi\.(?:mock|doMock|importActual)\s*\(\s*)(["'])([^"'\n]+)\1/g;

export function importedSpecifiers(sources: string[], packageName: string): Set<string> {
  const found = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(SPECIFIER)) {
      const spec = match[2];
      if (spec === packageName || spec.startsWith(`${packageName}/`)) found.add(spec);
    }
  }
  return found;
}

const ALIAS_BLOCK = /\balias\s*:\s*\{/;
const ALIAS_ENTRY =
  /(?:(["'])([^"'\n]+)\1|([A-Za-z_$][\w$]*))\s*:\s*path\.resolve\(\s*__dirname\s*,\s*(["'])([^"'\n]+)\4\s*\)/g;

/** Reads `resolve.alias` out of `vite.config.ts` as text and throws when its shape is not the one it knows. */
export function parseAliases(viteConfig: string): AliasEntry[] {
  const open = viteConfig.search(ALIAS_BLOCK);
  if (open < 0) throw new Error("vite.config.ts: no `alias: {` object found");
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = viteConfig.indexOf("{", open); i < viteConfig.length; i++) {
    const ch = viteConfig[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("vite.config.ts: the `alias` object is not closed");
  const body = viteConfig.slice(start + 1, end);
  const entries = [...body.matchAll(ALIAS_ENTRY)].map((m) => ({ key: m[2] ?? m[3], target: m[5] }));
  const resolveCalls = body.match(/path\.resolve\(/g)?.length ?? 0;
  if (entries.length === 0 || entries.length !== resolveCalls) {
    throw new Error(
      `vite.config.ts: the alias shape is not recognised (${entries.length} entries parsed, ${resolveCalls} path.resolve calls). ` +
        'Expected `"key": path.resolve(__dirname, "./relative/path")` entries; update this parser together with the config.',
    );
  }
  return entries;
}

export function checkAliases(
  packages: { name: string; dir: string; json: PackageJson }[],
  imported: Map<string, Set<string>>,
  aliases: AliasEntry[],
  root: string,
): string[] {
  const problems: string[] = [];
  const index = (key: string) => aliases.findIndex((a) => a.key === key);

  for (const pkg of packages) {
    if (!isSourceOnly(pkg.json)) continue;
    const exportsMap = exportTargets(pkg.json);
    for (const spec of imported.get(pkg.name) ?? []) {
      const subpath = spec === pkg.name ? "." : `.${spec.slice(pkg.name.length)}`;
      const direct = exportsMap.get(subpath);
      const wildcard = [...exportsMap.keys()].find(
        (k) => k.includes("*") && subpath.startsWith(k.slice(0, k.indexOf("*"))),
      );
      if (!direct && !wildcard) {
        problems.push(`${spec}: imported, but ${pkg.name} does not export "${subpath}"`);
        continue;
      }
      if (!direct && wildcard) {
        const prefix = wildcard.slice(0, wildcard.indexOf("*")).replace(/\/$/, "");
        const key = `${pkg.name}${prefix.slice(1)}`;
        if (index(key) < 0) problems.push(`${spec}: no alias "${key}" for the wildcard export "${wildcard}"`);
        continue;
      }
      const entry = entryFor(direct!);
      if (!entry) {
        problems.push(`${spec}: the export "${subpath}" names no file`);
        continue;
      }
      const at = index(spec);
      if (at < 0) {
        problems.push(`${spec}: no alias in vite.config.ts resolve.alias (source-only workspace, nothing to resolve through in the Docker build)`);
        continue;
      }
      const want = resolve(root, pkg.dir, entry);
      const got = resolve(root, aliases[at].target);
      if (want !== got) problems.push(`${spec}: alias points at ${aliases[at].target}, exports names ${posix.join(pkg.dir, entry)}`);
    }
  }

  aliases.forEach((less, i) => {
    aliases.forEach((more, j) => {
      if (j > i && more.key.startsWith(`${less.key}/`)) {
        problems.push(`"${more.key}" must come before "${less.key}": the shorter key would match it first`);
      }
    });
  });
  return problems;
}

function readWorkspaces(root: string): WorkspacePackage[] {
  const base = join(root, "packages");
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(base, d.name, "package.json")))
    .map((d) => ({
      dir: `packages/${d.name}`,
      json: JSON.parse(readFileSync(join(base, d.name, "package.json"), "utf-8")) as PackageJson,
    }));
}

function readSources(root: string): string[] {
  const base = join(root, "src");
  return (readdirSync(base, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx|mts|js|jsx)$/.test(f))
    .map((f) => readFileSync(join(base, f), "utf-8"));
}

describe("source-only workspace packages are aliased in vite.config.ts", () => {
  const workspaces = readWorkspaces(ROOT).filter((w): w is WorkspacePackage & { json: { name: string } } => !!w.json.name);
  const sourceOnly = workspaces.filter((w) => isSourceOnly(w.json));

  it("finds the source-only packages it is meant to guard", () => {
    expect(sourceOnly.map((w) => w.json.name)).toContain("@iterahq/shell-bridge");
  });

  it("aliases every imported subpath to the file exports names, most specific first", () => {
    const sources = readSources(ROOT);
    const imported = new Map(sourceOnly.map((w) => [w.json.name, importedSpecifiers(sources, w.json.name)]));
    const aliases = parseAliases(readFileSync(join(ROOT, "vite.config.ts"), "utf-8"));
    const packages = sourceOnly.map((w) => ({ name: w.json.name, dir: w.dir, json: w.json }));
    expect(checkAliases(packages, imported, aliases, ROOT)).toEqual([]);
  });
});

describe("checkAliases fixtures", () => {
  const bridge = {
    name: "@scope/bridge",
    dir: "packages/bridge",
    json: { name: "@scope/bridge", exports: { ".": "./src/index.ts", "./web": "./src/web.ts" } },
  };
  const imported = new Map([["@scope/bridge", new Set(["@scope/bridge", "@scope/bridge/web"])]]);
  const good: AliasEntry[] = [
    { key: "@scope/bridge/web", target: "./packages/bridge/src/web.ts" },
    { key: "@scope/bridge", target: "./packages/bridge/src/index.ts" },
  ];

  it("passes when every import is aliased to its export, specific key first", () => {
    expect(checkAliases([bridge], imported, good, "/r")).toEqual([]);
  });

  it("flags a missing alias", () => {
    const problems = checkAliases([bridge], imported, [good[1]], "/r");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("@scope/bridge/web: no alias");
  });

  it("flags an alias that points at the wrong file", () => {
    const wrong = [good[0], { key: "@scope/bridge", target: "./packages/bridge/src/web.ts" }];
    const problems = checkAliases([bridge], imported, wrong, "/r");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("exports names packages/bridge/src/index.ts");
  });

  it("flags a less specific alias placed before a more specific one", () => {
    const problems = checkAliases([bridge], imported, [good[1], good[0]], "/r");
    expect(problems).toEqual(['"@scope/bridge/web" must come before "@scope/bridge": the shorter key would match it first']);
  });

  it("flags an import of a subpath the package does not export", () => {
    const bad = new Map([["@scope/bridge", new Set(["@scope/bridge/nope"])]]);
    expect(checkAliases([bridge], bad, good, "/r")[0]).toContain('does not export "./nope"');
  });

  it("ignores a package that ships a build", () => {
    const built = { name: "@scope/built", dir: "packages/built", json: { name: "@scope/built", exports: { ".": { import: "./dist/index.js" } } } };
    expect(isSourceOnly(built.json)).toBe(false);
    expect(checkAliases([built], new Map([["@scope/built", new Set(["@scope/built"])]]), [], "/r")).toEqual([]);
  });
});

describe("importedSpecifiers", () => {
  it("reads static, dynamic, side-effect and mocked specifiers and ignores look-alikes", () => {
    const src = [
      `import { a } from '@scope/bridge';`,
      `const m = await import("@scope/bridge/web");`,
      `import '@scope/bridge/side';`,
      `vi.mock('@scope/bridge/mocked', () => ({}));`,
      `import x from '@scope/bridge-other';`,
    ].join("\n");
    expect([...importedSpecifiers([src], "@scope/bridge")].sort()).toEqual([
      "@scope/bridge",
      "@scope/bridge/mocked",
      "@scope/bridge/side",
      "@scope/bridge/web",
    ]);
  });
});

describe("parseAliases", () => {
  it("reads quoted and bare keys in order and skips a spread", () => {
    const cfg = `export default { resolve: { alias: {
      "@": path.resolve(__dirname, "./src"),
      "@a/b/web": path.resolve(__dirname, "./p/web.ts"),
      ...(flag ? {} : { swapy: path.resolve(__dirname, "./shim.ts") }),
    } } }`;
    expect(parseAliases(cfg)).toEqual([
      { key: "@", target: "./src" },
      { key: "@a/b/web", target: "./p/web.ts" },
      { key: "swapy", target: "./shim.ts" },
    ]);
  });

  it("throws when there is no alias object", () => {
    expect(() => parseAliases("export default {}")).toThrow(/no `alias: \{` object/);
  });

  it("throws when an entry is not a path.resolve(__dirname, literal) call", () => {
    const unknown = `export default { resolve: { alias: { "@a": path.resolve(__dirname, dir) } } }`;
    expect(() => parseAliases(unknown)).toThrow(/not recognised/);
  });

  it("parses the real vite.config.ts", () => {
    const entries = parseAliases(readFileSync(join(ROOT, "vite.config.ts"), "utf-8"));
    expect(entries.map((e) => e.key)).toContain("@iterahq/shell-bridge");
  });
});
