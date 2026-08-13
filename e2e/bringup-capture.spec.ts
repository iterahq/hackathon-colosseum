/**
 * THE BRING-UP, PROVED — an authenticated screen, captured twice, byte for byte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE IS FOR
 * ═══════════════════════════════════════════════════════════════════════════
 * `e2e/capture-regions.spec.ts` already proves the capture MECHANISM on three
 * screens that need no session: `/login`, a 404, and an in-page harness. Every
 * screen that a real ITERA user actually looks at is behind `RequireAuth`, and
 * no committed suite could reach one without driving production.
 *
 * This suite closes that gap. It signs in against the disposable stack
 * `bringup/up.sh` stands up, and asserts three things:
 *
 *  1. **The stack authenticates for real.** Three identities, three DIFFERENT
 *     roles in the access token. If `itera.custom_access_token_hook` is not
 *     wired, all three come back `owner` and this fails — see the note on the
 *     auto-provisioned personal tenant in `bringup/up.sh`.
 *  2. **`/` and three authenticated routes render, at the route asked for.**
 *     `RequireRole` redirects rather than refusing, so "it answered 200" is not
 *     evidence. Every capture asserts the settled pathname.
 *  3. **Two captures of one screen are BYTE-IDENTICAL** — the PNG *and*
 *     `regions.json`. This is the acceptance test of the whole initiative
 *     ("se o diff chegar a zero, tá pronto"), and it is unanswerable if the
 *     baseline itself churns.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ ONE MACHINE, NOT TWO — AND NOW IT MATTERS MORE
 * ═══════════════════════════════════════════════════════════════════════════
 * Byte-identity is asserted between two captures on ONE host in ONE run. Glyph
 * rasterisation belongs to the host's FreeType/fontconfig, so a cross-machine
 * comparison is NOT promised and must not be read into a green run. The full
 * list of what is and is not neutralised is in the header of
 * `e2e/support/captureRegions.ts`.
 *
 * That limit is why this suite records the host it ran on in
 * `bringup-manifest.json`. An index that later compares two captures has to be
 * able to see that they came from the same host class before it calls a
 * difference a change in the product.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A SECOND CONTEXT BUYS OVER A SECOND SHOT
 * ═══════════════════════════════════════════════════════════════════════════
 * Capture #2 opens a FRESH browser context and signs in again from nothing. A
 * second `page.screenshot()` of a settled page is the easy case; a fresh
 * context re-runs the login, re-mints a token with a new `iat`, re-boots the
 * SPA, re-requests the fonts and re-paints. That is what a scheduled capture
 * run does, so that is what is measured.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import {
  CAPTURE_CONTEXT_OPTIONS,
  REPO_ROOT,
  captureScreen,
  freezeForCapture,
  type CaptureResult,
} from './support/captureRegions';
import { bringupIdentity, expectSettledAt, signIn, type BringupIdentity } from './support/bringup';

/** Generated output. Gitignored; a run uploads it rather than committing it. */
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'e2e', 'artifacts', 'bringup');

/**
 * One capturable screen of the bring-up.
 *
 * `minRegions` is an anti-vacuity floor, not a target: a screen that failed to
 * render produces a perfect, empty map, and without a floor that passes every
 * other assertion in this file.
 */
interface BringupScreen {
  /** Directory name and the `screen` field of `regions.json`. */
  name: string;
  path: string;
  role: BringupIdentity['role'];
  minRegions: number;
  /** Must be visible before the shot. Proves content, not just a shell. */
  settleHint: string;
}

/**
 * `/` plus three authenticated routes — the DONE clause of DFL-0069B, exactly.
 *
 * Chosen for what each one PROVES, not for coverage:
 *   home     — the app renders for a signed-in user at all
 *   catalog  — a list read through PostgREST under the caller's RLS returns
 *              the seeded programme, so the data path is live end to end
 *   profile  — a per-user read; it is also the screen whose avatar grid used to
 *              be photographed before it painted
 *   admin    — the ROLE path. It is reachable only because the claim hook put
 *              `tenant_admin` in the token; with the hook off it redirects to
 *              `/` and `expectSettledAt` fails. This is the one screen that
 *              proves the bring-up is more than a database with a login form.
 *
 * The 25-screen manifest from DFL-00699 is deliberately NOT here. This task is
 * the bring-up; growing the manifest belongs to the capture harness (DFL-0069E)
 * and would hide a bring-up failure inside a long run.
 */
const SCREENS: BringupScreen[] = [
  { name: 'home',    path: '/',        role: 'tenant_admin', minRegions: 10, settleHint: 'main, [data-testid="home-page"]' },
  { name: 'catalog', path: '/catalog', role: 'tenant_admin', minRegions: 8,  settleHint: 'main' },
  { name: 'profile', path: '/profile', role: 'tenant_admin', minRegions: 8,  settleHint: 'main' },
  { name: 'admin',   path: '/admin',   role: 'tenant_admin', minRegions: 8,  settleHint: 'main' },
];

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

/** Sign in, navigate, settle, shoot — in a page that is frozen from the start. */
async function captureInto(page: Page, screen: BringupScreen, outDir: string): Promise<CaptureResult> {
  // BEFORE the first navigation: `addInitScript` only reaches documents created
  // after it is installed, and the login page is a document.
  await freezeForCapture(page);
  await signIn(page, bringupIdentity(screen.role));

  await page.goto(screen.path);
  await expectSettledAt(page, screen.path);
  await expect(page.locator(screen.settleHint).first()).toBeVisible();

  return captureScreen(page, { outDir, screen: screen.name });
}

/** The same, in a context of its own, so nothing carries over between runs. */
async function captureInFreshContext(
  browser: Browser,
  screen: BringupScreen,
  outDir: string
): Promise<CaptureResult> {
  // Scoped to the one directory this call owns: a stale pair from a previous
  // run must never be mistaken for this run's output, above all by the
  // byte-identity test.
  await rm(outDir, { recursive: true, force: true });
  const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
  try {
    return await captureInto(await context.newPage(), screen, outDir);
  } finally {
    await context.close();
  }
}

test.describe('the disposable ITERA stack is capturable', () => {
  test('the three identities carry three different roles', async ({ browser }) => {
    // Read the claim from the app's own session rather than from GoTrue
    // directly. What matters is the role the APP sees, and supabase-js is in
    // that path.
    const seen: Record<string, unknown> = {};

    for (const role of ['tenant_admin', 'instructor', 'learner'] as const) {
      const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
      try {
        const page = await context.newPage();
        await signIn(page, bringupIdentity(role));

        const claim = await page.evaluate(() => {
          // supabase-js persists under `sb-<ref>-auth-token`; the ref is
          // derived from the URL, so find the key rather than guessing it.
          const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
          if (!key) return null;
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const token: string | undefined = JSON.parse(raw)?.access_token;
          if (!token) return null;
          const body = token.split('.')[1];
          return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
        });

        expect(claim, `no session was persisted for the ${role} identity`).not.toBeNull();
        seen[role] = (claim as Record<string, unknown>).user_role;
      } finally {
        await context.close();
      }
    }

    // 🚨 The assertion that catches the failure that looks like success. The
    // `auth.users` insert trigger gives every password sign-up a personal
    // `plg-*` OWNER tenant, and the claim hook reports the HIGHEST role across
    // all memberships — so a bring-up that forgets to strip that membership
    // hands all three identities `owner`. Everything else in this file still
    // passes in that state.
    expect(seen).toEqual({
      tenant_admin: 'tenant_admin',
      instructor: 'instructor',
      learner: 'learner',
    });
  });

  for (const screen of SCREENS) {
    test(`${screen.name} (${screen.path}) renders and maps`, async ({ browser }) => {
      const result = await captureInFreshContext(browser, screen, path.join(ARTIFACT_ROOT, screen.name));

      expect(result.png.byteLength, 'the screenshot is empty').toBeGreaterThan(1_000);
      expect(
        result.manifest.regions.length,
        `${screen.name} produced ${result.manifest.regions.length} regions, below the ` +
          `anti-vacuity floor of ${screen.minRegions}. A screen that failed to render ` +
          `produces a perfect map of nothing.`
      ).toBeGreaterThanOrEqual(screen.minRegions);

      // Every region must name a repository file. The stamp suite already
      // proves the stamps resolve on unauthenticated screens; this proves the
      // authenticated ones are stamped too, which is not implied — they mount
      // through a different component tree.
      for (const region of result.manifest.regions) {
        expect(region.file, `a region on ${screen.name} carries no file`).toBeTruthy();
        expect(region.line).toBeGreaterThan(0);
      }
    });
  }

  for (const screen of SCREENS) {
    test(`${screen.name} captured twice is byte-identical`, async ({ browser }) => {
      const a = await captureInFreshContext(browser, screen, path.join(ARTIFACT_ROOT, `${screen.name}__a`));
      const b = await captureInFreshContext(browser, screen, path.join(ARTIFACT_ROOT, `${screen.name}__b`));

      const hashA = sha256(a.png);
      const hashB = sha256(b.png);

      expect(
        hashB,
        `two captures of ${screen.name} differ. Everything downstream compares two ` +
          `screenshots and asks whether the diff reached zero; if an UNCHANGED screen ` +
          `already differs, that question has no answer. Check what on this screen ` +
          `depends on the wall clock, on randomness, or on a font that arrived late.`
      ).toBe(hashA);

      // `regions.json` is asserted too, and separately. The pair is only useful
      // together: an identical image with a drifting map means a click resolves
      // to two different files on two runs, which is a worse failure than a
      // wobbling pixel and is invisible to an image-only comparison.
      expect(JSON.stringify(b.manifest), `the region map of ${screen.name} drifted between two runs`).toBe(
        JSON.stringify(a.manifest)
      );
    });
  }

  test.afterAll(async () => {
    // The host is recorded because byte-identity is a ONE-MACHINE promise. A
    // consumer comparing two captures must be able to see they came from the
    // same host before reading a difference as a change in the product.
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    await writeFile(
      path.join(ARTIFACT_ROOT, 'bringup-manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          host: hostname(),
          platform: process.platform,
          arch: process.arch,
          screens: SCREENS.map((s) => ({ name: s.name, path: s.path, role: s.role })),
          note:
            'Byte-identity is asserted between two captures on THIS host. Glyph ' +
            'rasterisation belongs to the host, so a cross-host comparison must run ' +
            'in one container to mean anything.',
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  });
});
