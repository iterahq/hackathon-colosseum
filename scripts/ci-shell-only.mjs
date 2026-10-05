#!/usr/bin/env node
/**
 * `changes` job of ci.yml (ADR-13, ADR-14, Q-7 = B). Decides whether a PR or push is "shell-only":
 * every changed path is under `apps/mobile/`. Only then do `activity-baseline`, `source-stamp` and
 * `browser-mode` skip. Everything uncertain answers `false` (run the jobs): no base, empty diff,
 * git failure, workflow_dispatch, schedule.
 *
 * The web-inert allow-list of `apps/mobile/scripts/web-inert.mjs` is wider (docs, ci files, ...) and
 * deliberately NOT used here: a web-inert change still redeploys, so these jobs still run for it.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SHELL_PREFIX = "apps/mobile/";

/** @param {string[]} paths @returns {boolean} */
export function isShellOnly(paths) {
  const changed = paths.map((p) => p.trim()).filter(Boolean);
  return changed.length > 0 && changed.every((p) => p.startsWith(SHELL_PREFIX));
}

const ZERO_SHA = /^0+$/;

/** @param {{ eventName?: string, baseSha?: string, before?: string, headSha?: string }} env */
export function diffArgs({ eventName, baseSha, before, headSha }) {
  if (!headSha) return null;
  if (eventName === "pull_request" && baseSha) return [`${baseSha}...${headSha}`];
  if (eventName === "push" && before && !ZERO_SHA.test(before)) return [`${before}..${headSha}`];
  return null;
}

function main() {
  const env = {
    eventName: process.env.EVENT_NAME,
    baseSha: process.env.BASE_SHA,
    before: process.env.BEFORE_SHA,
    headSha: process.env.HEAD_SHA,
  };
  let shellOnly = false;
  const range = diffArgs(env);
  if (range) {
    try {
      const out = execFileSync("git", ["diff", "--name-only", "--no-renames", ...range], { encoding: "utf8" });
      shellOnly = isShellOnly(out.split("\n"));
      console.log(`changed paths:\n${out.trim() || "(none)"}`);
    } catch (error) {
      console.log(`git diff failed, running every job: ${error.message}`);
    }
  } else {
    console.log(`no diff range for event ${env.eventName ?? "(unset)"}, running every job`);
  }
  console.log(`shell_only=${shellOnly}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `shell_only=${shellOnly}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
