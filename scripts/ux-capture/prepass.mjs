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
 * Usage (with the stamped preview already up on :4189):
 *   node scripts/ux-capture/prepass.mjs prepass.json
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

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
const browser = await chromium.launch({
  args: [
    '--disable-gpu',
    '--disable-partial-raster',
    '--disable-skia-runtime-opts',
    '--force-color-profile=srgb',
    '--disable-lcd-text',
    '--disable-font-subpixel-positioning',
    '--font-render-hinting=none',
  ],
});

for (const screen of flows.screens) {
  const target = concreteRoute(screen.route);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 120)}`));

  let record = { id: screen.id, route: screen.route, target };
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
writeFileSync(process.argv[2] || 'prepass.json', JSON.stringify(results, null, 2));
