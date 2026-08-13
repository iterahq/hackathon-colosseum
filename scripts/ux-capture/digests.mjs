/**
 * THE RECORD OF WHAT THE APP LOOKED LIKE, AND THE ONLY HONEST WAY TO COMPARE IT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MEASUREMENT THIS IS BUILT ON — read it before changing anything here
 * ═══════════════════════════════════════════════════════════════════════════
 * The received wisdom in this repo was that a screenshot cannot be compared
 * across machines, because glyph rasterisation belongs to the host's FreeType
 * and fontconfig. That is written into the header of
 * `e2e/support/captureRegions.ts` and it is why byte-identity was only ever
 * asserted between two captures in ONE run.
 *
 * It was measured on 2026-08-13 and it is NARROWER than that:
 *
 *   Host      : Debian 11 bullseye, 135 system fonts
 *   Container : Ubuntu 24.04 noble,  50 system fonts, different glibc/fontconfig
 *   Same      : Chromium revision 1228, x64, same physical machine
 *   Result    : 17 of 17 screens — screenshot.png AND regions.json —
 *               BYTE-IDENTICAL across the two.
 *
 * The mechanism explains it. Chrome-for-Testing bundles its own Skia and
 * FreeType; the app's fonts are self-hosted woff2 that the PAGE loads, so the
 * system font set never enters the raster; and `CAPTURE_LAUNCH_ARGS` removes
 * the GPU, the subpixel text path, the colour profile and the CPU-feature
 * dependent Skia paths. What is left is a pure function of the CHROMIUM
 * REVISION — which `package-lock.json` pins.
 *
 * ⚠️ That first measurement had a real hole, and it is worth keeping the record
 * of how it was closed. Both of those runs were on ONE physical machine, so one
 * CPU — and a different SIMD feature set is precisely what
 * `--disable-skia-runtime-opts` exists to neutralise. The flag was therefore
 * UNPROVEN, and this file said so.
 *
 * ✅ It is proven now. The first scheduled-workflow run
 * (`.github/workflows/ux-capture.yml`, run 31713197566, 2026-08-13) executed
 * the same container on a **`dfl-runner` VPS** — a different physical host, in a
 * different fleet, from the one that recorded `capture-digests.json`. Verdict:
 *
 *     screens compared : 8   layout moved : 0   PIXELS MOVED : 0
 *
 * So the pixels crossed a machine boundary, not only a rootfs boundary.
 *
 * ⚠️ The comparison below stays KEYED anyway, and that is deliberate. What is
 * now evidenced is that the key `chromium 1228 / x64` reproduces on two hosts;
 * what remains untested is every OTHER key — a Chromium bump, an arm64 runner.
 * A key mismatch therefore still RECORDS rather than fails, because the honest
 * default for an unmeasured combination is "we do not know", not "it is fine".
 * The `host` block each run writes into its artifact is what makes a future
 * mismatch diagnosable instead of mysterious.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TWO KINDS OF DIGEST, AND WHY THEY ARE TREATED DIFFERENTLY
 * ═══════════════════════════════════════════════════════════════════════════
 * `regions.json` is LAYOUT — boxes from `getBoundingClientRect()` over
 * page-loaded fonts. Nothing in it is rasterised, so it is the more portable of
 * the pair and it is the one a reader should trust first.
 *
 * `screenshot.png` is PIXELS. Comparable only under the same key
 * (`chromium` + `arch`). Under a different key this script reports the
 * difference and says the key changed — it does NOT call it a regression,
 * because a check that fails for the wrong reason forever teaches everyone to
 * ignore it.
 *
 * Usage:
 *   node scripts/ux-capture/digests.mjs --artifacts e2e/artifacts --write
 *   node scripts/ux-capture/digests.mjs --artifacts e2e/artifacts --check
 *
 * `--check` exits 0 when nothing moved, 1 when something did, 2 on a usage or
 * environment error. A difference is NOT necessarily a fault — for this plan it
 * is the product: it is the answer to "what changed since João validated this".
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECORD_PATH = path.join(REPO_ROOT, 'e2e', 'support', 'capture-digests.json');

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const ARTIFACTS = path.resolve(REPO_ROOT, arg('artifacts', 'e2e/artifacts'));
if (!existsSync(ARTIFACTS)) {
  console.error(`no artifacts at ${ARTIFACTS} — run the capture first`);
  process.exit(2);
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * The Chromium revision that will ACTUALLY be launched.
 *
 * ⚠️ Asked Playwright, never guessed from the directory listing. The first
 * version of this function listed `~/.cache/ms-playwright` and took the first
 * `chromium-*` entry it found. On a developer machine that has been through a
 * few Playwright bumps there are several — this host holds 1217, 1223 and 1228
 * — and it confidently keyed the record to **1217** while every capture in it
 * had been taken with **1228**. A key that names the wrong browser is worse
 * than no key: it makes an incomparable pair look comparable.
 */
async function chromiumRevision() {
  try {
    const { chromium } = await import('playwright');
    const match = /chromium[_a-z]*-(\d+)/.exec(chromium.executablePath());
    if (match) return match[1];
  } catch {
    /* fall through to the listing, and say so */
  }
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(process.env.HOME ?? '/root', '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const found = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d));
    // Exactly one, or we do not know which one ran. Refusing to guess keeps a
    // wrong key out of the record.
    if (found.length === 1) return found[0].replace('chromium-', '');
    if (found.length > 1) return 'ambiguous';
  }
  return 'unknown';
}

/**
 * Directories that hold a SECOND copy of a screen already recorded elsewhere.
 *
 * `stability/<screen>/a` and `/b` exist so a test can compare them against each
 * other inside one run; `proof-not-found` is the 404 shot again under another
 * name. Recording them would triple-count every drift — one real change would
 * be reported as three changed screens — and would make the record's diff read
 * as bigger than the change.
 */
const DUPLICATE = /(^|\/)(stability)(\/|$)|(^|\/)proof-/;

/** Walk the artifact tree and digest every pair it holds. */
function collect(root) {
  const screens = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (name !== 'regions.json') continue;
      const png = path.join(dir, 'screenshot.png');
      const key = path.relative(root, dir).split(path.sep).join('/');
      if (DUPLICATE.test(key)) continue;
      screens[key] = {
        regions: sha256(full),
        screenshot: existsSync(png) ? sha256(png) : null,
      };
    }
  };
  walk(root);
  return Object.fromEntries(Object.entries(screens).sort(([a], [b]) => a.localeCompare(b)));
}

const key = { chromium: await chromiumRevision(), arch: process.arch };
const screens = collect(ARTIFACTS);

if (Object.keys(screens).length === 0) {
  console.error(`no screenshot.png + regions.json pair found under ${ARTIFACTS}`);
  process.exit(2);
}

if (has('write')) {
  const record = {
    version: 1,
    // NOT the wall clock. A timestamp would make this file churn on every run
    // and make its diff useless, which is the one thing it exists for.
    recorded_for: key,
    note:
      'Digests of the capture pairs. `regions` is layout and travels between ' +
      'hosts; `screenshot` is pixels and is comparable only under the same ' +
      '`recorded_for` key. Refresh with: npm run ux-capture:digests -- --write',
    screens,
  };
  writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  console.log(`recorded ${Object.keys(screens).length} screen(s) for chromium ${key.chromium}/${key.arch}`);
  process.exit(0);
}

if (!has('check')) {
  console.error('one of --write or --check is required');
  process.exit(2);
}

if (!existsSync(RECORD_PATH)) {
  console.error(`no record at ${RECORD_PATH} — create it with --write`);
  process.exit(2);
}

const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
const sameKey =
  record.recorded_for?.chromium === key.chromium && record.recorded_for?.arch === key.arch;

const added = [];
const removed = [];
const layoutMoved = [];
const pixelsMoved = [];

for (const [name, current] of Object.entries(screens)) {
  const before = record.screens?.[name];
  if (!before) {
    added.push(name);
    continue;
  }
  if (before.regions !== current.regions) layoutMoved.push(name);
  else if (before.screenshot !== current.screenshot) pixelsMoved.push(name);
}
for (const name of Object.keys(record.screens ?? {})) {
  if (!screens[name]) removed.push(name);
}

console.log(`capture digest check — chromium ${key.chromium}/${key.arch}`);
console.log(
  `record was written for chromium ${record.recorded_for?.chromium}/${record.recorded_for?.arch}` +
    `${sameKey ? '' : '  ⚠️ DIFFERENT KEY — pixel differences below are expected, not regressions'}`
);
console.log(`  screens compared : ${Object.keys(screens).length}`);
console.log(`  layout moved     : ${layoutMoved.length}${layoutMoved.length ? ' -> ' + layoutMoved.join(', ') : ''}`);
console.log(`  pixels moved     : ${pixelsMoved.length}${pixelsMoved.length ? ' -> ' + pixelsMoved.join(', ') : ''}`);
console.log(`  new screens      : ${added.length}${added.length ? ' -> ' + added.join(', ') : ''}`);
console.log(`  gone screens     : ${removed.length}${removed.length ? ' -> ' + removed.join(', ') : ''}`);

// A layout change, a new screen and a disappeared screen all count under any
// key. A pixel change counts only under the SAME key.
const drifted =
  layoutMoved.length + added.length + removed.length + (sameKey ? pixelsMoved.length : 0);

if (drifted === 0) {
  console.log('\nnothing moved.');
  process.exit(0);
}

console.log(
  `\n${drifted} screen(s) differ from the record. If the change is intended, refresh with:\n` +
    '  npm run ux-capture:digests -- --write'
);

// Machine-readable, for the workflow that turns this into an issue body.
writeFileSync(
  path.join(ARTIFACTS, 'digest-drift.json'),
  `${JSON.stringify({ key, sameKey, layoutMoved, pixelsMoved, added, removed }, null, 2)}\n`,
  'utf8'
);
process.exit(1);
