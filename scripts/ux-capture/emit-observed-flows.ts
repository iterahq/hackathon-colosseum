/**
 * THE OBSERVED DOCUMENT — the declared map, plus what a run actually saw.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT THE FILE IN THE REPOSITORY
 * ═══════════════════════════════════════════════════════════════════════════
 * `.dfl-ux-paths/flows.json` is what the application DECLARES: it is small,
 * semantic, reviewed in a diff, and it is derived from the route table. This
 * emitter produces the other kind of document — what one capture run, as one
 * identity, at one moment, actually reached. It carries screenshot URLs, so it
 * is machine output, and machine output does not belong in the repository.
 *
 * That is the storage rule of plan `20260812-ux-map-observed-reality-lens`,
 * stated in one line: *the repository holds what we declare, media holds what
 * the machine observed, the database holds what we ask questions about.* This
 * file writes the middle one, and it writes it to a path OUTSIDE the tree by
 * default so that the rule is hard to break by accident.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ A SCREEN THAT WAS NOT PHOTOGRAPHED KEEPS AN EMPTY `screenshots[]`
 * ═══════════════════════════════════════════════════════════════════════════
 * Every declared screen stays in the document, in the declared order, whether
 * the run reached it or not. Dropping the misses would produce a document that
 * validates, reads as complete, and quietly redefines coverage as "of what we
 * managed to photograph". The empty array IS the coverage signal, and the
 * index writer downstream reads it the same way.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔑 CONTENT-STABLE, BECAUSE THE DIGEST IS THE VERSION KEY
 * ═══════════════════════════════════════════════════════════════════════════
 * ADR-3 keys a version on the sha256 of these bytes. So this document must not
 * embed anything that moves when nothing changed: `generated_at` is inherited
 * from the declared document (which itself carries the COMMIT time, not the
 * wall clock), and `captured_at` on each screenshot is the FROZEN capture
 * instant the harness already writes into `regions.json`. Two runs of an
 * unchanged application therefore produce one version, not two — which is what
 * makes "what changed since I validated this" answerable at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 📱 `platform` AND `orientation` ARE DERIVED, NOT HARD-TYPED
 * ═══════════════════════════════════════════════════════════════════════════
 * They used to be the literals `"web"` and `"landscape"`, which was true of
 * every capture this emitter had ever seen and false the moment a second
 * viewport existed. They now come from `screenshotMetaForViewport(--viewport)`.
 *
 * ⚠️ `platform` follows the viewport's `isMobile`, NOT its width. A 390-wide
 * DESKTOP context is honestly `web`; calling it `mobile` would file a desktop
 * layout under a mobile key where no reader downstream could tell. Both fields
 * are enum-constrained in `schema/v1.json`, so a wrong value does not degrade
 * quietly — the document stops validating and the viewer refuses to load it.
 *
 * ⚠️ The viewport table comes from `./viewports.ts` and NOT from
 * `@devfellowship/ux-paths-capture`, even though the package owns it. This
 * emitter is spawned by `publish-capture.mjs` on a runner with **no
 * `node_modules`** — read the header of `viewports.ts` for the full reason, and
 * `scripts/ux-capture/viewports.test.ts` for the test that keeps the two
 * copies equal.
 *
 * Usage:
 *   npx tsx scripts/ux-capture/emit-observed-flows.ts \
 *     --captures e2e/artifacts/live-capture/tenant_admin \
 *     --uploads /run/uploads.json --role tenant_admin \
 *     [--viewport desktop|mobile] \
 *     --out /run/itera-player.observed.tenant_admin.flows.json
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_VIEWPORT,
  resolveViewportName,
  screenshotMetaForViewport,
  viewportLabelFor,
} from "./viewports.ts";

interface Screenshot {
  platform: "web" | "mobile";
  orientation: "portrait" | "landscape";
  viewport: string;
  url: string;
  captured_at?: string;
}

interface Screen {
  id: string;
  screenshots?: Screenshot[];
  [k: string]: unknown;
}

interface FlowsDoc {
  app_id: string;
  screens: Screen[];
  test_metadata?: Record<string, unknown>;
  [k: string]: unknown;
}

interface CaptureResult {
  screen_id: string;
  verdict: string;
  landed: string | null;
  regions: number | null;
  note: string | null;
}

interface CaptureManifest {
  role: string;
  declared: number;
  captured: number;
  screens: CaptureResult[];
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

async function main(): Promise<void> {
  const capturesDir = path.resolve(arg("captures"));
  const uploadsPath = path.resolve(arg("uploads"));
  const role = arg("role");
  const viewport = resolveViewportName(arg("viewport", DEFAULT_VIEWPORT));
  const meta = screenshotMetaForViewport(viewport);
  const outPath = path.resolve(arg("out"));
  const flowsPath = path.resolve(
    arg("flows", path.join(process.cwd(), ".dfl-ux-paths", "flows.json"))
  );

  const doc = JSON.parse(await readFile(flowsPath, "utf8")) as FlowsDoc;
  const manifest = JSON.parse(
    await readFile(path.join(capturesDir, "capture-manifest.json"), "utf8")
  ) as CaptureManifest;
  const uploads = JSON.parse(await readFile(uploadsPath, "utf8")) as Record<
    string,
    { url: string; media_id?: string | null }
  >;

  const verdicts = new Map(manifest.screens.map((s) => [s.screen_id, s]));

  let withShot = 0;
  const missing: string[] = [];

  for (const screen of doc.screens) {
    const verdict = verdicts.get(screen.id);
    if (!verdict || verdict.verdict !== "captured") {
      screen.screenshots = [];
      missing.push(`${screen.id} (${verdict?.verdict ?? "not attempted"})`);
      continue;
    }

    const png = path.join(capturesDir, screen.id, "screenshot.png");
    const up = uploads[png];
    if (!up) {
      // Captured but not uploaded is a REAL gap, not a rounding error: the
      // index would carry a digest with no image behind it, and the lens would
      // draw an overlay on nothing.
      screen.screenshots = [];
      missing.push(`${screen.id} (captured, not uploaded)`);
      continue;
    }

    const regions = JSON.parse(
      await readFile(path.join(capturesDir, screen.id, "regions.json"), "utf8")
    ) as { viewport: { width: number; height: number }; capturedAt: string };

    // 🚨 The size comes from `regions.json`, which the harness wrote from the
    // real browser — never from the `--viewport` argument. If the two disagree
    // the pair was taken at a viewport this run is not publishing, and a
    // screenshot labelled with a size it does not have would put a phone-shaped
    // region map beside a desktop image. That is a stop, not a warning.
    const measured = `${regions.viewport.width}x${regions.viewport.height}`;
    if (measured !== meta.viewport) {
      throw new Error(
        `${screen.id}: regions.json was captured at ${measured} but this run publishes ` +
          `--viewport ${viewport} (${meta.viewport}). The capture directory and the ` +
          `viewport argument disagree — check published-screens.json.`
      );
    }

    screen.screenshots = [
      {
        platform: meta.platform,
        orientation: meta.orientation,
        viewport: measured,
        url: up.url,
        captured_at: regions.capturedAt,
      },
    ];
    withShot += 1;
  }

  // The observed document says what it is, and as whom. Without this a reader
  // holding two documents of the same app cannot tell the admin's view from
  // the learner's — they differ only in which screens have an image.
  //
  // ⚠️ It goes into `notes`, and not into three new fields, because the schema
  // sets `additionalProperties: false` on `test_metadata`. A tidier shape would
  // fail validation, and an observed document that does not validate cannot be
  // loaded by the viewer at all — the external transport admits a document only
  // if it validates in full.
  //
  // ⚠️ `test_metadata.default_viewport` is NOT touched. It names the DEFAULT
  // pass of this application, which is still `desktop`, and it would be wrong
  // for the mobile document to claim the app's default is a phone. Which
  // viewport THIS document holds is stated in the note below and, per
  // screenshot, in `screenshots[].platform` / `.viewport`.
  doc.test_metadata = {
    ...(doc.test_metadata ?? {}),
    notes:
      `OBSERVED CAPTURE — role=${role}; viewport=${viewport} (${viewportLabelFor(viewport)}); ` +
      `${withShot}/${doc.screens.length} declared screens carry a screenshot. ` +
      (missing.length ? `Not photographed: ${missing.join("; ")}. ` : "") +
      `Screens with an empty screenshots[] were DECLARED and NOT reached by this run — ` +
      `that is the coverage signal, not an omission. ` +
      `Original note: ${String((doc.test_metadata ?? {}).notes ?? "—")}`,
  };

  await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(
    `${outPath}\n  role=${role}  viewport=${viewport}  ` +
      `${withShot}/${doc.screens.length} screens carry a screenshot`
  );
  if (missing.length) console.log(`  not photographed: ${missing.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
