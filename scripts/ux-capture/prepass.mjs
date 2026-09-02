/**
 * THE HALF OF THE EXPLORATION THAT NEEDS NO MODEL.
 *
 * Navigate every route `.dfl-ux-paths/flows.json` declares, in the hermetic
 * zero-credential preview, and record what a capture would actually get:
 * whether the route serves its own content or silently redirects, how many
 * stamped regions are visible, what `data-testid`s are on the page, and what
 * failed in the console.
 *
 * ⚠️ RUN THIS BEFORE ANY MODEL. Measured on 2026-08-13 it answered 31 routes in
 * about four minutes for zero tokens, and it settled the expensive question —
 * 24 of the 31 redirect, so only 7 were worth exploring at all. A model pointed
 * at all 31 would have spent most of its budget re-photographing the login page
 * under 24 different names. The output of this script is what BOUNDS the model
 * run that follows it, and the model is then asked only what this cannot
 * answer: which STATES exist behind an interaction.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 📱 AND IT IS THE SAME TOOL AT A SECOND VIEWPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * `--viewport mobile` runs the identical walk in the mobile capture context
 * (390x844, `isMobile`, `hasTouch` — see ADR-6 of plan
 * `20260902-ux-paths-responsive-mobile-capture`). That is what BOUNDS the
 * mobile round the same way the first run bounded the desktop one: diffing the
 * two outputs says which routes changed their marker, their region count or
 * their testids at 390, and only those need a human decision. Everything else
 * replays unchanged.
 *
 * ⚠️ The context is NOT restated here any more. It comes from
 * `captureContextOptions(preset)` in `@devfellowship/ux-paths-capture`, which
 * is the same object `e2e/support/captureRegions.ts` and the capture suites
 * use. The literal that used to live in this file was a third copy of the
 * determinism settings, and a determinism setting that exists twice diverges
 * silently — both copies stay green while the images stop being comparable.
 *
 * Usage (with the stamped preview already up on :4189):
 *   node scripts/ux-capture/prepass.mjs prepass.json
 *   node scripts/ux-capture/prepass.mjs --viewport mobile prepass.mobile.json
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  CAPTURE_LAUNCH_ARGS,
  captureContextOptions,
  resolveViewportSpec,
  viewportLabel,
} from '@devfellowship/ux-paths-capture/playwright';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

/**
 * The output path is POSITIONAL and has been since this script was written, so
 * a flag cannot be allowed to eat it. `--viewport mobile out.json` used to
 * resolve to `argv[2] === 'mobile'` and write the report over the word the flag
 * was carrying — a silent wrong answer, and the classic cost of bolting a flag
 * onto a positional interface.
 */
const positional = (() => {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      i += 1; // every flag here takes a value
      continue;
    }
    out.push(argv[i]);
  }
  return out;
})();

const { name: viewportName, preset, custom } = resolveViewportSpec(
  arg('viewport', 'desktop')
);
if (custom) {
  console.warn(
    `⚠️  ${viewportLabel(preset)} matches no preset, so it takes the DEFAULT input ` +
      `modality at a new size. At a narrow width that is a "narrow desktop" and not ` +
      `a phone — see ADR-6. Give the size a preset if it is worth capturing twice.`
  );
}

const BASE = process.env.STAMP_BASE_URL || 'http://127.0.0.1:4189';
const flows = JSON.parse(readFileSync('.dfl-ux-paths/flows.json', 'utf8'));

// Params substituted with values that are syntactically plausible but that no
// stub backend can resolve — the point is to see WHAT the app does with an
// unresolvable id, which is itself a state worth capturing.
const PARAMS = {
  ':traceId': '00000000-0000-4000-8000-000000000001',
  ':activityId': '00000000-0000-4000-8000-000000000002',
  ':unitId': '00000000-0000-4000-8000-000000000003',
  ':lessonId': '00000000-0000-4000-8000-000000000004',
  ':sessionId': '00000000-0000-4000-8000-000000000005',
  ':slug': 'itera-fellowship',
  ':code': 'ABC123',
};

function concreteRoute(route) {
  if (route === '/*') return '/there-is-no-such-route';
  let out = route;
  for (const [k, v] of Object.entries(PARAMS)) out = out.replaceAll(k, v);
  return out;
}

const results = [];
const browser = await chromium.launch({ args: [...CAPTURE_LAUNCH_ARGS] });
const contextOptions = captureContextOptions(preset);

console.log(
  `prepass at ${viewportName} (${viewportLabel(preset)}) against ${BASE} — ` +
    `${flows.screens.length} declared routes`
);

for (const screen of flows.screens) {
  const target = concreteRoute(screen.route);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 120)}`));

  let record = { id: screen.id, route: screen.route, target, viewport: viewportName };
  try {
    await page.goto(BASE + target, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    const probe = await page.evaluate(() => {
      const stamped = document.querySelectorAll('[data-source]');
      let visible = 0;
      for (const el of stamped) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) visible += 1;
      }
      const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
      const testids = Array.from(document.querySelectorAll('[data-testid]'))
        .map((e) => e.getAttribute('testid') || e.getAttribute('data-testid'))
        .filter(Boolean);
      return {
        stampedTotal: stamped.length,
        stampedVisible: visible,
        textLength: text.length,
        textHead: text.slice(0, 180),
        h1: document.querySelector('h1')?.textContent?.trim().slice(0, 90) ?? null,
        testids: Array.from(new Set(testids)).slice(0, 12),
        path: location.pathname + location.search,
      };
    });
    record = { ...record, ...probe, ok: true };
    record.redirected = probe.path !== target;
  } catch (err) {
    record.ok = false;
    record.error = String(err).slice(0, 200);
  }
  record.consoleErrors = consoleErrors.slice(0, 4);
  record.failedRequests = Array.from(new Set(failedRequests)).slice(0, 4);
  results.push(record);
  await context.close();
  const flag = record.ok
    ? `${record.redirected ? 'REDIR->' + record.path : 'served'} regions=${record.stampedVisible} text=${record.textLength}`
    : 'ERROR';
  console.log(`${screen.id.padEnd(36)} ${flag}`);
}

await browser.close();

// The viewport travels WITH the report. Two prepass files are meant to be
// diffed against each other, and a report that does not say which viewport
// produced it is a report that can be diffed the wrong way round.
writeFileSync(
  positional[0] || `prepass.${viewportName}.json`,
  JSON.stringify(
    {
      viewport: viewportName,
      viewport_size: viewportLabel(preset),
      base_url: BASE,
      routes: results,
    },
    null,
    2
  )
);
