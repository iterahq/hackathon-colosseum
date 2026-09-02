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
 * ═══════════════════════════════════════════════════════════════════════════
 * 📱 AND THE VIEWPORT IS A THIRD KIND OF KEY — ADR-7
 * ═══════════════════════════════════════════════════════════════════════════
 * Every screen recorded here now carries `recorded_for.viewport`, and a screen
 * whose viewport is NOT the default is treated exactly like a screen under a
 * different `chromium`/`arch` key: a PIXEL difference is RECORDED and does not
 * fail the check; a LAYOUT difference still counts.
 *
 * That split is ADR-7 of plan `20260902-ux-paths-responsive-mobile-capture`,
 * and it is narrower than "mobile never fails", deliberately:
 *
 *  - The 7 launch flags in `CAPTURE_LAUNCH_ARGS` were TUNED AT 1280. Nothing
 *    about rasterisation at 390 had been measured when the mobile pass was
 *    designed, so the honest default for pixels was "we do not know".
 *  - `regions.json` is LAYOUT — boxes from `getBoundingClientRect()` over
 *    page-loaded fonts, with nothing rasterised. It is the portable half at any
 *    width, and it is the half that answers "did the mobile layout move". Making
 *    THAT recording-only would have left the mobile pass with no assertion at
 *    all, which is the blind spot this file exists to avoid.
 *
 * ✅ MEASURED 2026-09-02, and the news is good: two fresh 390x844 captures of
 * `otp_invalid_code_error` from two clean contexts were BYTE-IDENTICAL, and so
 * were ten consecutive runs of the whole `manifest-mobile` project. So the
 * pixel tolerance below has not yet been NEEDED. It stays because one host and
 * one Chromium revision is not the same evidence the desktop key has (which
 * crossed a rootfs boundary AND a machine boundary before it was trusted), and
 * because a tolerance that is never exercised costs nothing while an assertion
 * that fails for an unmeasured reason costs the whole check's credibility.
 *
 * ⚠️ A screen record written before this change has no `recorded_for`, and it
 * is read as the DEFAULT viewport — which is what it was. Nothing in the
 * existing record moves.
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

/**
 * The viewport a capture directory belongs to, read from its own name.
 *
 * `manifest/login@390x844` → `390x844`; `manifest/login` → the default. The
 * label is used rather than a preset NAME on purpose: this script has no
 * `node_modules` in the publish job and must not need the preset table to read
 * its own record.
 */
const DEFAULT_VIEWPORT_LABEL = 'default';
function viewportOf(key) {
  const match = /@(\d+x\d+)$/.exec(path.basename(key));
  return match ? match[1] : DEFAULT_VIEWPORT_LABEL;
}

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
        // ADR-3 puts the viewport in the directory NAME, so the key already
        // carries it and this is a read rather than a second source of truth.
        // An unsuffixed directory is the default viewport, which is what every
        // record written before the mobile pass is.
        recorded_for: { viewport: viewportOf(key) },
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
      'top-level `recorded_for` key. Each screen also carries its own ' +
      '`recorded_for.viewport`, read from the directory suffix (ADR-3): a pixel ' +
      'difference at a NON-DEFAULT viewport is RECORDED and does not fail the ' +
      'check (ADR-7), while a LAYOUT difference counts at every viewport. ' +
      'Refresh with: npm run ux-capture:digests -- --write',
    screens,
  };
  writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const spread = {};
  for (const cur of Object.values(screens)) {
    const v = cur.recorded_for?.viewport ?? DEFAULT_VIEWPORT_LABEL;
    spread[v] = (spread[v] ?? 0) + 1;
  }
  console.log(
    `recorded ${Object.keys(screens).length} screen(s) for chromium ` +
      `${key.chromium}/${key.arch} — ` +
      Object.entries(spread)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([v, n]) => `${v}=${n}`)
        .join(' ')
  );
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
/**
 * Pixel differences on a NON-DEFAULT viewport. ADR-7: recorded, never fatal.
 * Kept in its own bucket rather than merged into `pixelsMoved`, so the report
 * says which differences were counted and which were only noted — a single
 * list with a footnote is how a tolerance becomes invisible.
 */
const pixelsMovedUnmeasuredViewport = [];

/** A record written before the mobile pass has no `recorded_for`. It was default. */
const viewportOfRecord = (entry) => entry?.recorded_for?.viewport ?? DEFAULT_VIEWPORT_LABEL;

for (const [name, current] of Object.entries(screens)) {
  const before = record.screens?.[name];
  if (!before) {
    added.push(name);
    continue;
  }
  if (before.regions !== current.regions) {
    // LAYOUT counts at every viewport. It is the portable half — no
    // rasterisation in it — and at 390 it is the only thing that can answer
    // "did the mobile layout move".
    layoutMoved.push(name);
    continue;
  }
  if (before.screenshot === current.screenshot) continue;
  const viewport = viewportOfRecord(current);
  const wasViewport = viewportOfRecord(before);
  if (viewport !== wasViewport) {
    // The pair was re-recorded at another viewport under the same directory
    // name. That is a rename, not a drift, and comparing the pixels of two
    // different viewports would report a difference that means nothing.
    layoutMoved.push(`${name} (viewport changed ${wasViewport} -> ${viewport})`);
    continue;
  }
  if (viewport === DEFAULT_VIEWPORT_LABEL) pixelsMoved.push(name);
  else pixelsMovedUnmeasuredViewport.push(`${name} @${viewport}`);
}
for (const name of Object.keys(record.screens ?? {})) {
  if (!screens[name]) removed.push(name);
}

const byViewport = {};
for (const [name, cur] of Object.entries(screens)) {
  const v = viewportOfRecord(cur);
  byViewport[v] = (byViewport[v] ?? 0) + 1;
  void name;
}

console.log(`capture digest check — chromium ${key.chromium}/${key.arch}`);
console.log(
  `record was written for chromium ${record.recorded_for?.chromium}/${record.recorded_for?.arch}` +
    `${sameKey ? '' : '  ⚠️ DIFFERENT KEY — pixel differences below are expected, not regressions'}`
);
console.log(`  screens compared : ${Object.keys(screens).length}`);
console.log(
  `  by viewport      : ` +
    Object.entries(byViewport)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([v, n]) => `${v}=${n}`)
      .join(' ')
);
console.log(`  layout moved     : ${layoutMoved.length}${layoutMoved.length ? ' -> ' + layoutMoved.join(', ') : ''}`);
console.log(`  pixels moved     : ${pixelsMoved.length}${pixelsMoved.length ? ' -> ' + pixelsMoved.join(', ') : ''}`);
console.log(
  `  pixels moved (non-default viewport, RECORDED not counted — ADR-7) : ` +
    `${pixelsMovedUnmeasuredViewport.length}` +
    `${pixelsMovedUnmeasuredViewport.length ? ' -> ' + pixelsMovedUnmeasuredViewport.join(', ') : ''}`
);
console.log(`  new screens      : ${added.length}${added.length ? ' -> ' + added.join(', ') : ''}`);
console.log(`  gone screens     : ${removed.length}${removed.length ? ' -> ' + removed.join(', ') : ''}`);

// A layout change, a new screen and a disappeared screen all count under any
// key and at any viewport. A pixel change counts only under the SAME
// chromium/arch key AND at the default viewport (ADR-7).
const drifted =
  layoutMoved.length + added.length + removed.length + (sameKey ? pixelsMoved.length : 0);

if (drifted === 0) {
  console.log('\nnothing moved.');
  if (pixelsMovedUnmeasuredViewport.length) {
    // Not a failure, and not silence either. A tolerance nobody is told about
    // is the same as no check.
    console.log(
      `⚠️  ${pixelsMovedUnmeasuredViewport.length} screen(s) at a non-default viewport ` +
        `changed PIXELS with their layout unchanged. Recorded, not counted (ADR-7): the ` +
        `launch flags were tuned at 1280 and rasterisation at another width is not yet ` +
        `evidenced across hosts. If this keeps happening, that is the pixel diff ADR-7 ` +
        `asks a human to look at.`
    );
    writeFileSync(
      path.join(ARTIFACTS, 'digest-drift.json'),
      `${JSON.stringify(
        { key, sameKey, layoutMoved, pixelsMoved, pixelsMovedUnmeasuredViewport, added, removed },
        null,
        2
      )}\n`,
      'utf8'
    );
  }
  process.exit(0);
}

console.log(
  `\n${drifted} screen(s) differ from the record. If the change is intended, refresh with:\n` +
    '  npm run ux-capture:digests -- --write'
);

// Machine-readable, for the workflow that turns this into an issue body.
writeFileSync(
  path.join(ARTIFACTS, 'digest-drift.json'),
  `${JSON.stringify(
    { key, sameKey, layoutMoved, pixelsMoved, pixelsMovedUnmeasuredViewport, added, removed },
    null,
    2
  )}\n`,
  'utf8'
);
process.exit(1);
