import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diffArgs, isShellOnly } from "./ci-shell-only.mjs";

describe("isShellOnly", () => {
  it("skips when every path is under apps/mobile/", () => {
    expect(isShellOnly(["apps/mobile/app.json", "apps/mobile/src/a.ts"])).toBe(true);
  });
  it("runs when any path is outside apps/mobile/", () => {
    expect(isShellOnly(["apps/mobile/app.json", "src/x.ts"])).toBe(false);
  });
  it("runs for the workflow file itself", () => {
    expect(isShellOnly([".github/workflows/ci.yml"])).toBe(false);
  });
  it("runs for an empty diff", () => {
    expect(isShellOnly([])).toBe(false);
    expect(isShellOnly(["", "\n"])).toBe(false);
  });
  it("does not match a sibling directory sharing the prefix", () => {
    expect(isShellOnly(["apps/mobile-web/x.ts"])).toBe(false);
    expect(isShellOnly(["apps/mobile"])).toBe(false);
  });
});

describe("diffArgs", () => {
  it("uses the merge base for a pull request", () => {
    expect(diffArgs({ eventName: "pull_request", baseSha: "b", headSha: "h" })).toEqual(["b...h"]);
  });
  it("uses before..head for a push", () => {
    expect(diffArgs({ eventName: "push", before: "a", headSha: "h" })).toEqual(["a..h"]);
  });
  it("fails open without a base", () => {
    expect(diffArgs({ eventName: "push", before: "0".repeat(40), headSha: "h" })).toBeNull();
    expect(diffArgs({ eventName: "pull_request", headSha: "h" })).toBeNull();
    expect(diffArgs({ eventName: "workflow_dispatch", headSha: "h" })).toBeNull();
    expect(diffArgs({ eventName: "schedule" })).toBeNull();
  });
});

describe("git diff --no-renames", () => {
  it("lists both sides of a rename out of apps/mobile", () => {
    const dir = mkdtempSync(join(tmpdir(), "shell-only-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    mkdirSync(join(dir, "apps/mobile"), { recursive: true });
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "apps/mobile/a.ts"), "export const a = 1;\n".repeat(20));
    git("add", ".");
    git("commit", "-qm", "base");
    renameSync(join(dir, "apps/mobile/a.ts"), join(dir, "src/a.ts"));
    git("add", "-A");
    git("commit", "-qm", "move");
    const paths = git("diff", "--name-only", "--no-renames", "HEAD~1..HEAD").split("\n");
    expect(paths).toContain("src/a.ts");
    expect(isShellOnly(paths)).toBe(false);
  });
});
