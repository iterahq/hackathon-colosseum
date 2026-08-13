/**
 * THE CAPTURE RUN — the real, logged-in application, photographed screen by
 * screen, with a `regions.json` beside every image.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ═══════════════════════════════════════════════════════════════════════════
 * `e2e/capture-regions.spec.ts` proves the PAIR is correct: the image and the
 * map agree, a coordinate resolves to the right file, and two captures of one
 * screen are byte-identical. It proves that on THREE screens, against a
 * hermetic stub with no session — `/login`, a 404, and a fixture harness.
 *
 * That is the unit test of the mechanism. This is the run that uses it. It
 * drives the SAME `captureScreen()` against an application that is signed in as
 * a real member, reading the real database, so what comes out is what the
 * product actually looks like today rather than what it looks like with nobody
 * logged in.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ THE BUILD IS THE HALF THAT IS EASY TO GET WRONG
 * ═══════════════════════════════════════════════════════════════════════════
 * The deployed `app.iterahq.dev` CANNOT be the target, and not for a policy
 * reason — for a mechanical one. `regions.json` is built by reading the
 * `data-source` attribute that `scripts/source-stamp.ts` writes, and that
 * plugin is gated on `ITERA_SOURCE_STAMP=1` precisely so it NEVER ships to a
 * learner. Pointing this script at production would produce perfect
 * screenshots and an empty map: photographs nobody can click.
 *
 * So the target is a `vite preview` of a build of THIS tree, made with
 * `ITERA_SOURCE_STAMP=1` and with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
 * pointing at the real project. `VITE_*` is inlined at build time, which is
 * what makes "the same bundle, repointed at runtime" impossible and why the
 * build must be made for the capture.
 *
 * The consequence to state honestly: the bytes are not the deployed bundle's
 * bytes. It is the same source at a known commit, the same data, the same
 * session — plus one attribute per element. Everything a designer looks at is
 * real; the thing that is added is the thing that makes it clickable.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚨 A SILENT REDIRECT IS THE FAILURE THIS SCRIPT EXISTS TO CATCH
 * ═══════════════════════════════════════════════════════════════════════════
 * `RequireRole` does not render a 403. It redirects to `/`. A capture that
 * trusts `page.goto()` therefore files the HOME PAGE under six different admin
 * screen ids and reports full coverage — a map that is not merely incomplete
 * but confidently wrong, which is worse.
 *
 * Every screen is therefore verified AFTER navigation: the pathname the browser
 * ended on must match the route that was asked for. A mismatch is recorded as
 * `bounced`, with the landing path, and is NOT written as a capture. The same
 * check catches `RequireSubscription` sending an unentitled identity to
 * `/subscribe`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PARAMETERS COME FROM A FILE, NEVER FROM THE SOURCE
 * ═══════════════════════════════════════════════════════════════════════════
 * Eight of the declared routes carry a `:param`. Those values are production
 * row ids: they are not the repository's to know, they rot, and committing one
 * would put a customer's identifier in a public-ish tree. `--params` supplies
 * them at run time (see `params.example.json`), and a screen whose parameter is
 * absent is reported as `skipped-no-param` rather than guessed at.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A RUN WRITES
 * ═══════════════════════════════════════════════════════════════════════════
 *   <out>/<screen_id>/screenshot.png
 *   <out>/<screen_id>/regions.json
 *   <out>/capture-manifest.json   — every declared screen and its verdict
 *
 * The manifest lists EVERY declared screen, including the ones that were not
 * reached. That direction is deliberate and it is the same one the index writer
 * takes: coverage is only meaningful if the denominator is what was declared,
 * not what happened to work.
 *
 * Usage:
 *   ITERA_CAPTURE_USERNAME=… ITERA_CAPTURE_PASSWORD=… \
 *   npx tsx scripts/ux-capture/capture-live.ts \
 *     --base http://127.0.0.1:4189 --role tenant_admin \
 *     --params /run/params.json --out e2e/artifacts/live-capture/tenant_admin
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CAPTURE_CONTEXT_OPTIONS,
  CAPTURE_LAUNCH_ARGS,
  captureScreen,
  freezeForCapture,
} from "../../e2e/support/captureRegions";

/* ────────────────────────────────────────────────────────────────────────────
 * The declared map
 * ──────────────────────────────────────────────────────────────────────────── */

interface FlowsScreen {
  id: string;
  name?: string;
  route?: string;
  source_ref?: { component_file?: string };
  prerequisites?: { auth_required?: boolean; auth_role?: string };
}

interface FlowsDoc {
  app_id: string;
  app_version?: string;
  screens: FlowsScreen[];
}

/** One screen's verdict. `captured` is the only one that produces artifacts. */
type Verdict = "captured" | "bounced" | "skipped-no-param" | "error";

interface ScreenResult {
  screen_id: string;
  name: string | null;
  /** The route as DECLARED, `:param` and all. What the index records. */
  route: string | null;
  /** The concrete path this run asked for, after parameter substitution. */
  requested: string | null;
  /** Where the browser actually ended up. The evidence behind the verdict. */
  landed: string | null;
  verdict: Verdict;
  regions: number | null;
  files: number | null;
  source_ref_file: string | null;
  note: string | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Arguments
 * ──────────────────────────────────────────────────────────────────────────── */

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

/**
 * Substitute `:param` segments from the supplied bindings.
 *
 * Returns null when a parameter has no binding — the caller reports that as
 * `skipped-no-param`. It never invents a value: a fabricated id renders an
 * error state, and an error state photographed under the screen's own name is
 * exactly the confidently-wrong map this script is built to avoid.
 *
 * `/*` is the router's catch-all, not a parameter. It is rewritten to a path
 * that is guaranteed to match nothing, which is what renders `NotFound`.
 */
export function concretePath(
  route: string,
  params: Record<string, string>
): { path: string; missing: string[] } {
  if (route === "/*") return { path: "/there-is-no-such-route", missing: [] };
  const missing: string[] = [];
  const out = route.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => {
    const value = params[name];
    if (!value) {
      missing.push(name);
      return `:${name}`;
    }
    return encodeURIComponent(value);
  });
  return { path: out, missing };
}

/**
 * Does the landing path satisfy the route that was asked for?
 *
 * Compared segment by segment against the DECLARED route so that a `:param`
 * segment matches anything — an app that canonicalises an id (a slug rewritten,
 * a uuid normalised) is still on the screen that was requested. Everything else
 * must match literally, which is what makes the `RequireRole` redirect to `/`
 * fail the check.
 */
export function landedOnRoute(route: string, landed: string): boolean {
  if (route === "/*") return true; // any unmatched path renders NotFound
  const want = route.split("/").filter(Boolean);
  const got = landed.split("/").filter(Boolean);
  if (want.length !== got.length) return false;
  return want.every((seg, i) => seg.startsWith(":") || seg === got[i]);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The run
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Sign in through the application's own form.
 *
 * The same three lines as `e2e/route-access-matrix.spec.ts`, and the testid
 * matters for the same reason it does there: "Entrar" also matches the
 * "Entrar com DFL" federated button, which is a different flow entirely.
 */
async function login(page: Page, base: string, user: string, pass: string): Promise<void> {
  await page.goto(`${base}/login`);
  await page.getByLabel(/e-?mail/i).fill(user);
  await page.getByLabel(/senha|password/i).fill(pass);
  await page.getByTestId("submit-login").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

/** Let the guards, the lazy chunk and the first query settle. */
async function settleNavigation(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {});
  // The guards render "Loading…" while auth and membership resolve. Waiting it
  // out is what stops a spinner being filed as the screen.
  await page
    .locator("text=/^Loading…$/")
    .waitFor({ state: "detached", timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(1_200);
}

async function main(): Promise<void> {
  const base = arg("base", "http://127.0.0.1:4189").replace(/\/$/, "");
  const role = arg("role");
  const outDir = path.resolve(arg("out"));
  // The repository the stamps are resolved against. Taken as an argument rather
  // than derived from this module's own location: the runner may execute a
  // bundled copy of this file, and a `REPO_ROOT` computed from
  // `import.meta.url` would then point at the bundle's directory and silently
  // resolve every stamp to "file does not exist".
  const root = path.resolve(arg("root", process.cwd()));
  const flowsPath = path.resolve(arg("flows", path.join(root, ".dfl-ux-paths", "flows.json")));
  const paramsPath = process.argv.includes("--params") ? path.resolve(arg("params")) : null;
  const only = process.argv.includes("--only") ? arg("only").split(",") : null;

  // `--anonymous` is not a convenience. Six of the declared screens are the
  // signed-OUT surfaces — `/login`, `/signup`, the OTP and password-recovery
  // pages — and an authenticated session redirects away from every one of them.
  // A signed-in pass can therefore never photograph them, and a pass that tried
  // would file the home page under `login`. They need a session-less run, and a
  // run with no session must be indexed under the role it really had.
  const anonymous = process.argv.includes("--anonymous");
  const user = process.env.ITERA_CAPTURE_USERNAME ?? "";
  const pass = process.env.ITERA_CAPTURE_PASSWORD ?? "";
  if (!anonymous && (!user || !pass)) {
    throw new Error("ITERA_CAPTURE_USERNAME and ITERA_CAPTURE_PASSWORD must be set");
  }

  const doc = JSON.parse(await readFile(flowsPath, "utf8")) as FlowsDoc;
  const params: Record<string, string> = paramsPath
    ? (JSON.parse(await readFile(paramsPath, "utf8")) as Record<string, string>)
    : {};

  const screens = doc.screens.filter((s) => !only || only.includes(s.id));
  console.log(
    `capturing ${screens.length} declared screen(s) of ${doc.app_id} as role=${role} from ${base}`
  );

  const browser: Browser = await chromium.launch({ args: CAPTURE_LAUNCH_ARGS });
  const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
  const page = await context.newPage();

  // BEFORE the first navigation — `addInitScript` only reaches documents
  // created after it is installed.
  await freezeForCapture(page);
  if (anonymous) {
    console.log("no session: capturing the signed-out surfaces");
  } else {
    await login(page, base, user, pass);
    console.log(`signed in; landed on ${new URL(page.url()).pathname}`);
  }

  const results: ScreenResult[] = [];

  for (const screen of screens) {
    const route = screen.route ?? null;
    const base_result: ScreenResult = {
      screen_id: screen.id,
      name: screen.name ?? null,
      route,
      requested: null,
      landed: null,
      verdict: "error",
      regions: null,
      files: null,
      source_ref_file: screen.source_ref?.component_file ?? null,
      note: null,
    };

    if (!route) {
      results.push({ ...base_result, note: "the flows document declares no route" });
      continue;
    }

    const { path: requested, missing } = concretePath(route, params);
    if (missing.length) {
      results.push({
        ...base_result,
        requested,
        verdict: "skipped-no-param",
        note: `no binding for ${missing.map((m) => `:${m}`).join(", ")}`,
      });
      console.log(`  ${screen.id.padEnd(38)} SKIP  (needs ${missing.join(", ")})`);
      continue;
    }

    try {
      await page.goto(`${base}${requested}`, { waitUntil: "commit" });
      await settleNavigation(page);
      const landed = new URL(page.url()).pathname;

      if (!landedOnRoute(route, landed)) {
        results.push({
          ...base_result,
          requested,
          landed,
          verdict: "bounced",
          note: `a guard redirected ${requested} to ${landed}; this identity does not reach this screen`,
        });
        console.log(`  ${screen.id.padEnd(38)} BOUNCED -> ${landed}`);
        continue;
      }

      const { manifest } = await captureScreen(page, {
        outDir: path.join(outDir, screen.id),
        screen: screen.id,
        root,
      });
      const files = new Set(manifest.regions.map((r) => r.file)).size;
      results.push({
        ...base_result,
        requested,
        landed,
        verdict: "captured",
        regions: manifest.regions.length,
        files,
      });
      console.log(
        `  ${screen.id.padEnd(38)} OK    ${String(manifest.regions.length).padStart(4)} regions  ${String(files).padStart(3)} files`
      );
    } catch (e) {
      results.push({ ...base_result, requested, verdict: "error", note: (e as Error).message });
      console.log(`  ${screen.id.padEnd(38)} ERROR ${(e as Error).message.slice(0, 90)}`);
    }
  }

  await context.close();
  await browser.close();

  const captured = results.filter((r) => r.verdict === "captured");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "capture-manifest.json"),
    `${JSON.stringify(
      {
        app_id: doc.app_id,
        app_version: doc.app_version ?? null,
        role,
        base,
        declared: results.length,
        captured: captured.length,
        screens: results,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `\n${captured.length}/${results.length} declared screens captured as role=${role}\n` +
      `manifest: ${path.join(outDir, "capture-manifest.json")}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
