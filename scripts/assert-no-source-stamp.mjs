#!/usr/bin/env node
/**
 * THE `data-source` STAMP MUST NOT SHIP — ASSERTED OVER THE BUILT ARTIFACT.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THE ARTIFACT AND NOT THE CONFIG
 * ═════════════════════════════════════════════════════════════════════════════
 * `scripts/source-stamp.ts` is off unless `ITERA_SOURCE_STAMP` is set, and
 * `scripts/source-stamp.test.ts` proves that about the gate FUNCTION. Neither
 * proves it about the thing that reaches a browser. Between the gate and the
 * browser sit `vite.config.ts`, the plugin order, a future `.env` file, a
 * Dockerfile `ENV` line, and whatever a deploy job exports. Every one of those
 * can turn the stamp on without touching the gate.
 *
 * So this reads `dist/` — the bytes that ship — and counts the attribute. Same
 * reasoning as `scripts/assert-entrypoint-isolation.mjs` next door: the source
 * says what we meant, the artifact says what we did.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * A GUARD THAT CANNOT GO RED IS NOT A GUARD
 * ═════════════════════════════════════════════════════════════════════════════
 * A grep for a string that is normally absent passes for free — it would keep
 * passing if the pattern were misspelled, if the walker never descended, or if
 * `dist/` were empty. Two things stop that here:
 *
 *  1. **A self-test on every run.** Before scanning anything, the detector runs
 *     over a synthetic buffer that DOES contain a stamp, and over one that does
 *     not. If it misses the first or flags the second, this exits non-zero
 *     saying the detector is broken — not "clean".
 *  2. **`--expect-present`.** The capture CI job builds WITH the flag and runs
 *     this same script in that mode. So both verdicts are exercised on every
 *     PR, by one detector, over two real builds. That is the mutation test.
 *
 * It also refuses an empty or missing directory, because "no files scanned" is
 * the most convincing way to find nothing.
 *
 * USAGE
 *   node scripts/assert-no-source-stamp.mjs [dir]                  # expect ZERO
 *   node scripts/assert-no-source-stamp.mjs [dir] --expect-present # expect >0
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

/** Must match `SOURCE_STAMP_ATTR` in `scripts/source-stamp.ts`. */
const ATTR = "data-source";

/**
 * The attribute survives the build in two shapes and the check has to see both:
 * `<div data-source="…">` in HTML, and `"data-source":"…"` as a prop key inside
 * the compiled `jsx()` calls in JS. Searching for the bare attribute name
 * covers each of them, and the value shape is checked separately.
 */
const NEEDLE = Buffer.from(ATTR, "utf8");

/** `src/pages/HomePage.tsx:42` — what the plugin writes. */
const VALUE_RE = /[\w./-]+\.tsx:\d+/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** The whole detector, isolated so the self-test can exercise the real thing. */
function findStamps(buffer) {
  const hits = [];
  let from = 0;
  for (;;) {
    const at = buffer.indexOf(NEEDLE, from);
    if (at === -1) break;
    hits.push(buffer.subarray(at, Math.min(at + 120, buffer.length)).toString("utf8"));
    from = at + NEEDLE.length;
  }
  return hits;
}

function selfTest() {
  const positive = Buffer.from(`<div ${ATTR}="src/pages/HomePage.tsx:42" class="x">`, "utf8");
  const negative = Buffer.from('<div class="x" data-testid="y">', "utf8");

  const found = findStamps(positive);
  if (found.length !== 1) {
    console.error(
      `::error::assert-no-source-stamp self-test FAILED: the detector missed a known stamp. ` +
        `The guard is broken, so a clean result would mean nothing.`
    );
    process.exit(2);
  }
  if (!VALUE_RE.test(found[0])) {
    console.error("::error::assert-no-source-stamp self-test FAILED: value pattern does not match");
    process.exit(2);
  }
  if (findStamps(negative).length !== 0) {
    console.error("::error::assert-no-source-stamp self-test FAILED: false positive on clean markup");
    process.exit(2);
  }
}

const args = process.argv.slice(2);
const expectPresent = args.includes("--expect-present");
const dir = args.find((a) => !a.startsWith("--")) ?? "dist";

selfTest();

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`::error::${dir} does not exist - nothing was built, so nothing was checked`);
  process.exit(1);
}

const files = walk(dir);
if (files.length === 0) {
  console.error(`::error::${dir} is empty - nothing was checked`);
  process.exit(1);
}

let stampedFiles = 0;
let stampedOccurrences = 0;
const samples = [];

for (const file of files) {
  const hits = findStamps(readFileSync(file));
  if (hits.length === 0) continue;
  stampedFiles += 1;
  stampedOccurrences += hits.length;
  if (samples.length < 5) samples.push(`${path.relative(dir, file)}: ${hits[0].split("\n")[0]}`);
}

const scanned = `${files.length} files under ${dir}/`;

if (expectPresent) {
  if (stampedOccurrences === 0) {
    console.error(
      `::error::expected ${ATTR} stamps in ${dir}/ and found none. Either ITERA_SOURCE_STAMP ` +
        `did not reach the build, or the plugin stopped stamping. Scanned ${scanned}.`
    );
    process.exit(1);
  }
  console.log(
    `ok: ${stampedOccurrences} ${ATTR} occurrences in ${stampedFiles} of ${files.length} files - ` +
      `the capture build is stamped, and this detector can see it`
  );
  for (const s of samples) console.log(`  ${s}`);
  process.exit(0);
}

if (stampedOccurrences > 0) {
  console.error(
    `::error::${ATTR} reached the production build - ${stampedOccurrences} occurrences in ` +
      `${stampedFiles} files. This leaks the private repository layout to anyone with dev tools. ` +
      `Something set ITERA_SOURCE_STAMP, or the gate in scripts/source-stamp.ts was widened. ` +
      `See the header of that file.`
  );
  for (const s of samples) console.error(`  ${s}`);
  process.exit(1);
}

console.log(`ok: zero ${ATTR} stamps in the production build (scanned ${scanned})`);
