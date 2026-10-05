// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface Check {
  file: string;
  kind: "array" | "lines";
  member?: RegExp;
  extra?: string[];
}
interface WebInert {
  ALLOW_LIST: string;
  CHECKS: Check[];
  checkChange(check: Check, before: string, after: string): string[];
}

// The script is a plain .mjs run by the workflow with no install; it is loaded by URL so the root
// `tsc` program does not need types for it.
const mod = (await import(new URL("../../apps/mobile/scripts/web-inert.mjs", import.meta.url).href)) as WebInert;
const check = (file: string) => mod.CHECKS.find((c) => c.file === file) as Check;
const allowed = (path: string) => new RegExp(mod.ALLOW_LIST).test(path);

const ESLINT = `export default tseslint.config(\n  { ignores: ["**/dist", "storybook-static"] },\n  { rules: { "react-hooks/rules-of-hooks": "error" } },\n);\n`;
const RENOVATE = `{\n  "extends": ["config:recommended"],\n  "ignorePaths": ["**/node_modules/**", "apps/mobile/**"],\n  "schedule": ["x"]\n}\n`;
const DOCKERIGNORE = `node_modules\n.env*\n*.md\napps/\n`;

describe("web-inert.mjs, eslint.config.js and renovate.json", () => {
  it("accepts an entry under apps/mobile/ added inside the array", () => {
    const after = ESLINT.replace(`"storybook-static"`, `"storybook-static", "apps/mobile/.expo"`);
    expect(mod.checkChange(check("eslint.config.js"), ESLINT, after)).toEqual([]);
    const r = RENOVATE.replace(`"apps/mobile/**"`, `"apps/mobile/**", "apps/mobile/dist-ios/**"`);
    expect(mod.checkChange(check("renovate.json"), RENOVATE, r)).toEqual([]);
  });
  it("rejects an added entry outside apps/mobile/, even inside the array", () => {
    const after = ESLINT.replace(`"storybook-static"`, `"storybook-static", "src/**"`);
    expect(mod.checkChange(check("eslint.config.js"), ESLINT, after)).toEqual([expect.stringContaining('added the entry "src/**"')]);
  });
  it("rejects a removed entry", () => {
    const after = ESLINT.replace(`"**/dist", `, "");
    expect(mod.checkChange(check("eslint.config.js"), ESLINT, after)).toEqual([expect.stringContaining('removed the entry "**/dist"')]);
  });
  it("rejects a rule turned off outside the array", () => {
    const after = ESLINT.replace(`"error"`, `"off"`);
    expect(mod.checkChange(check("eslint.config.js"), ESLINT, after)).toEqual([expect.stringContaining("changed outside its")]);
  });
  it("rejects the decoy: a quote in a comment inside the array plus a new config object", () => {
    const after = ESLINT.replace(
      `{ ignores: ["**/dist", "storybook-static"] },`,
      `{ ignores: ["**/dist", "storybook-static" /* " */] },\n  { rules: { "react-hooks/rules-of-hooks": "off" }, ignores: [ /* " */ ] },`,
    );
    expect(mod.checkChange(check("eslint.config.js"), ESLINT, after).length).toBeGreaterThan(0);
  });
  it("accepts the Renovate preset entries when the key is created, and rejects other new ones", () => {
    const without = RENOVATE.replace(/ {2}"ignorePaths".*\n/, "");
    expect(mod.checkChange(check("renovate.json"), without, RENOVATE.replace(`"**/node_modules/**", `, `"**/node_modules/**", "**/vendor/**", `))).toEqual([]);
    expect(mod.checkChange(check("renovate.json"), without, RENOVATE.replace(`"apps/mobile/**"`, `"apps/mobile/**", "public/**"`))).toEqual([expect.stringContaining('"public/**"')]);
  });
  it("rejects a changed key of renovate.json outside ignorePaths", () => {
    expect(mod.checkChange(check("renovate.json"), RENOVATE, RENOVATE.replace('"x"', '"y"'))).toEqual([expect.stringContaining("changed outside its")]);
  });
});

describe("web-inert.mjs, .dockerignore and .gitignore", () => {
  it("accepts an added apps/ line, a blank line and a comment", () => {
    expect(mod.checkChange(check(".dockerignore"), DOCKERIGNORE, `${DOCKERIGNORE}\n# note\napps/extra/\n`)).toEqual([]);
  });
  it("rejects dropping .env*", () => {
    expect(mod.checkChange(check(".dockerignore"), DOCKERIGNORE, DOCKERIGNORE.replace(".env*\n", ""))).toEqual([expect.stringContaining('".env*"')]);
  });
  it("rejects adding public/ to .dockerignore", () => {
    expect(mod.checkChange(check(".dockerignore"), DOCKERIGNORE, `${DOCKERIGNORE}public/\n`)).toEqual([expect.stringContaining("does not start with apps/")]);
  });
  it("rejects adding a line to .gitignore that is not under apps/", () => {
    expect(mod.checkChange(check(".gitignore"), "node_modules\n", "node_modules\nsrc/\n")).toEqual([expect.stringContaining('"src/"')]);
  });
});

describe("web-inert allow-list", () => {
  it.each(["apps/mobile/app.json", "scripts/mobile/one-copy.test.ts", ".github/workflows/mobile-shell.yml", "docs/mobile-shell.md", "README.md", "CLAUDE.md", "eslint.config.js"])(
    "allows %s",
    (p) => {
      expect(allowed(p)).toBe(true);
    },
  );
  it.each(["public/secret.md", "src/content/x.md", "packages/activities/README.md", "db/README.md", ".github/workflows/deploy.yml", "src/App.tsx", "package.json", "Dockerfile"])(
    "does not allow %s",
    (p) => {
      expect(allowed(p)).toBe(false);
    },
  );
  it("the workflow carries exactly this allow-list", () => {
    const yml = readFileSync(fileURLToPath(new URL("../../.github/workflows/mobile-shell.yml", import.meta.url)), "utf8");
    expect(yml).toContain(`grep -qvE '${mod.ALLOW_LIST}'`);
  });
});
