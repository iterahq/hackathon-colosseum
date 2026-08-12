#!/usr/bin/env node
/**
 * ux-paths-guard — the CI gate for `.dfl-ux-paths/flows.json`.
 *
 * ## Why this exists
 *
 * On 2026-08-12 fourteen repos across `devfellowship` and `iterahq` shipped a
 * `flows.json` and **nothing anywhere asserted that any of them was present,
 * valid, or still matched the code**. Measured that day: apart from the one this
 * plan had just created, the newest file had not been touched in 48 days; nine
 * of the fourteen had exactly one commit ever; four did not validate against the
 * schema they declared; and `dfl-bmcanvas` was an un-filled `init` stub with zero
 * screens. Three committed fixtures inside `dfl-ux-paths` itself were invalid
 * too — two of them the ones the viewer's Comparar tab loads by default.
 *
 * A map nobody checks stops being a map. This is the check.
 *
 * ## What it checks, and in what order
 *
 * Every check runs even after an earlier one fails, so one CI run reports every
 * problem instead of one problem per push. The only exception is that the
 * document must parse before anything can read it.
 *
 *   1. PRESENT     — the file exists where the convention says it does.
 *   2. PARSES      — it is JSON.
 *   3. VALID       — it conforms to the v1 schema, every error located.
 *   4. NON-EMPTY   — `screens[]` has at least one entry. An `init` stub is not a map.
 *   5. UNIQUE IDS  — `screen.id` is the schema's own "sticky 1:1 join key across
 *                    apps". JSON Schema cannot express uniqueness across array
 *                    items, so a duplicate id validates cleanly and then silently
 *                    breaks every comparison built on the join.
 *   6. WHOLE FLOWS — every flow step names a screen the document declares. JSON
 *                    Schema cannot express a cross-reference, so a flow pointing
 *                    at a deleted screen validates and then renders as a broken
 *                    edge in the atlas.
 *   7. LIVE REFS   — every `source_ref.component_file` and every
 *                    `file_path_chain[]` entry still exists in the tree.
 *   8. ROUTE PARITY— the declared `screen.route` set equals the route set the
 *                    repo's own extractor prints. Opt-in: a repo supplies the
 *                    extractor, because only the repo knows its router.
 *
 * ## Freshness is checked against CONTENT, never against a timestamp
 *
 * `generated_at` was deliberately made the **commit** time rather than the wall
 * clock (plan `20260812-ux-map-observed-reality-lens`, P2), so that regenerating
 * at an unchanged commit is byte-identical. That is what makes a content
 * comparison possible — and it is the same property that makes a timestamp
 * comparison meaningless: an untouched file and a freshly regenerated one carry
 * the same `generated_at`, so "how old is this field" answers nothing about
 * whether the map still describes the code.
 *
 * Checks 7 and 8 are therefore the freshness signal, and each catches a
 * different half:
 *
 *   - **7 catches code that moved out from under the map.** A component renamed,
 *     moved or deleted while `flows.json` still points at its old path. This is
 *     the commonest rot and it needs no configuration.
 *   - **8 catches the app growing without the map.** A route added to the router
 *     and never declared, or a declared route the app no longer serves.
 *
 * ### What they do NOT catch — stated plainly, because a guard that oversells
 * ### itself is worse than no guard
 *
 *   - A component file that still exists but no longer renders that screen.
 *     The path is live, so check 7 passes. Nothing here reads the component.
 *   - A screen whose behaviour changed completely while its route and its file
 *     stayed put. This gate proves the map's *skeleton* matches the code; it
 *     says nothing about what the screen now does.
 *   - Modal/dialog states modelled as screens (ADR-7 of the plan). They usually
 *     carry no unique route, so check 8 cannot see them at all, and a modal that
 *     disappeared from the product leaves a screen entry nothing will flag.
 *   - Anything at all about routes, when the repo supplies no extractor. Check 8
 *     then reports SKIP, loudly, and the run can still be green. It is opt-in on
 *     purpose — a wrong extractor is worse than an absent one — but a SKIP is a
 *     hole, not a pass.
 *   - Screenshots. `screenshots: []` is correct today; the capture harness fills
 *     it later. Requiring it now would make every repo red for a reason no repo
 *     can fix.
 *
 * ## Usage
 *
 *   node scripts/ux-paths-guard.mjs --repo-root . [--flows .dfl-ux-paths/flows.json]
 *                                   [--routes-file routes.txt]
 *                                   [--spec-dir /tmp/ux-paths-spec]
 *                                   [--vendored-schema schema/ux-paths-v1.json]
 *
 * Exit codes: 0 = every check passed (SKIPs allowed), 1 = at least one check
 * failed, 2 = the guard itself could not run (bad usage, no schema available).
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const DEFAULT_FLOWS_PATH = ".dfl-ux-paths/flows.json";

// ---------------------------------------------------------------------------
// The spec: package first, vendored schema second
// ---------------------------------------------------------------------------

/**
 * Resolves a validator, preferring `@devfellowship/ux-paths-spec`.
 *
 * The package is the sanctioned source — it ships the schema, the types
 * generated from it, and a zero-dependency `validate()` whose agreement with
 * Ajv is pinned by a parity test in `dfl-ux-paths`. Prefer it whenever it
 * resolves.
 *
 * It is **not on the registry yet** (checked 2026-08-12: `npm view` returns
 * E404). Its publish workflow exists and is `workflow_dispatch`, and the
 * `NPM_TOKEN` it was blocked on now exists as an org secret — so publishing is
 * a decision away, not a build away. Until then the vendored copy of
 * `schema/v1.json` in this repo, evaluated by Ajv, is the fallback.
 *
 * Ajv is not a weaker gate. It is the reference implementation of JSON Schema
 * and the engine the package's own parity test measures itself against, so if
 * the two ever disagree the package is the one that is wrong. What the fallback
 * genuinely costs is the *provenance*: a vendored schema is a copy, and a copy
 * can drift. That is why `.github/workflows/ux-paths-schema-drift.yml` diffs it
 * against `dfl-ux-paths` on a schedule and on every PR that touches it — the
 * copy is guarded by a mechanism, not by a promise.
 *
 * The day the package publishes, this function starts preferring it with no
 * edit here, and the drift workflow starts diffing against the registry too.
 *
 * @param {{ specDir?: string, vendoredSchema?: string, cwd?: string }} opts
 * @returns {Promise<{ source: string, describe: string, validate: (doc: unknown) => { valid: boolean, errors: {formatted: string}[] } }>}
 */
export async function loadSpec(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const specDir = opts.specDir;

  if (specDir) {
    const pkgMain = path.join(specDir, "node_modules", "@devfellowship", "ux-paths-spec");
    if (fs.existsSync(pkgMain)) {
      const req = createRequire(path.join(specDir, "noop.js"));
      const resolved = req.resolve("@devfellowship/ux-paths-spec");
      const mod = await import(pathToFileURL(resolved).href);
      const version = JSON.parse(
        fs.readFileSync(path.join(pkgMain, "package.json"), "utf8"),
      ).version;
      return {
        source: "package",
        describe: `@devfellowship/ux-paths-spec@${version} (its own zero-dependency validate())`,
        validate: (doc) => {
          const result = mod.validate(doc);
          return {
            valid: result.valid,
            errors: result.valid ? [] : result.errors.map((e) => ({ formatted: e.formatted })),
          };
        },
      };
    }
  }

  const schemaPath = opts.vendoredSchema
    ? path.resolve(cwd, opts.vendoredSchema)
    : path.resolve(cwd, "schema", "ux-paths-v1.json");
  if (!fs.existsSync(schemaPath)) {
    throw new GuardSetupError(
      `no spec available: @devfellowship/ux-paths-spec did not resolve from ${specDir ?? "(no --spec-dir given)"}, ` +
        `and the vendored schema is not at ${schemaPath}.`,
    );
  }

  const modulesRoot = path.join(specDir ?? cwd, "node_modules");
  let Ajv2020;
  let addFormats;
  let ajvVersion;
  try {
    // Bounded on purpose. Node's resolver walks UP through every ancestor
    // `node_modules`, and this repo has an eslint-transitive **ajv 6** on that
    // path — a version that predates draft 2020-12 entirely. Picking it up
    // silently would compile the schema under the wrong dialect and produce a
    // verdict nobody asked for. So the resolved file must live under the
    // node_modules we were pointed at, or the guard refuses to run.
    const req = createRequire(path.join(modulesRoot, "noop.js"));
    const inside = (p) => path.resolve(p).startsWith(path.resolve(modulesRoot) + path.sep);

    // `ajv/dist/2020.js`, and the NAMED export — exactly what
    // `dfl-ux-paths:spec/src/__tests__/ajv-parity.test.ts` uses to prove the
    // published validator and Ajv agree. Any other entry point is a different
    // dialect and a different verdict.
    const ajvPath = req.resolve("ajv/dist/2020.js");
    const formatsPath = req.resolve("ajv-formats");
    if (!inside(ajvPath) || !inside(formatsPath)) {
      throw new Error(
        `resolved outside ${modulesRoot}: ajv=${ajvPath} ajv-formats=${formatsPath}`,
      );
    }
    ajvVersion = JSON.parse(fs.readFileSync(path.join(modulesRoot, "ajv", "package.json"), "utf8")).version;
    if (Number(ajvVersion.split(".")[0]) < 8) {
      throw new Error(`ajv ${ajvVersion} is too old — draft 2020-12 needs ajv >= 8`);
    }
    ({ Ajv2020 } = await import(pathToFileURL(ajvPath).href));
    const formatsModule = await import(pathToFileURL(formatsPath).href);
    addFormats = formatsModule.default ?? formatsModule;
  } catch (cause) {
    throw new GuardSetupError(
      `no spec available: @devfellowship/ux-paths-spec is not published yet, and the Ajv fallback ` +
        `could not load either. Install ajv@^8 + ajv-formats@^3 into ${modulesRoot}, ` +
        `or publish the spec package. Original error: ${cause.message}`,
    );
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const compiled = ajv.compile(schema);
  const digest = sha256(fs.readFileSync(schemaPath));

  return {
    source: "vendored",
    describe:
      `vendored ${path.relative(cwd, schemaPath) || schemaPath} (sha256 ${digest.slice(0, 12)}), ` +
      `evaluated by Ajv2020 ${ajvVersion} — @devfellowship/ux-paths-spec is not on the registry yet`,
    validate: (doc) => {
      const valid = compiled(doc);
      if (valid) return { valid: true, errors: [] };
      return {
        valid: false,
        errors: (compiled.errors ?? []).map((e) => ({
          formatted: formatAjvError(e),
        })),
      };
    },
  };
}

/** Ajv's error object, rendered in the same shape the spec package prints. */
function formatAjvError(e) {
  const where = e.instancePath ? e.instancePath.replace(/^\//, "").split("/").join(".") : "<root>";
  const extra = [];
  if (e.params?.additionalProperty) extra.push(`unexpected property "${e.params.additionalProperty}"`);
  if (e.params?.allowedValues) extra.push(`expected one of: ${JSON.stringify(e.params.allowedValues)}`);
  if (e.params?.missingProperty) extra.push(`missing property "${e.params.missingProperty}"`);
  if (e.params?.pattern) extra.push(`expected to match: ${e.params.pattern}`);
  if (e.params?.type) extra.push(`expected type: ${e.params.type}`);
  if (e.params?.format) extra.push(`expected format: ${e.params.format}`);
  return `${where}: ${e.message}${extra.length ? ` (${extra.join("; ")})` : ""}`;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Raised when the guard cannot run at all. Distinct from "the repo failed". */
export class GuardSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "GuardSetupError";
  }
}

// ---------------------------------------------------------------------------
// Route normalisation
// ---------------------------------------------------------------------------

/**
 * One route, in one shape, so two sets can be compared.
 *
 * Only the differences that are never meaningful are erased: surrounding
 * whitespace, a trailing slash on a non-root path, and a missing leading slash.
 * Parameter NAMES are deliberately preserved — `/lesson/:lessonId` and
 * `/lesson/:id` are different declarations of the same URL, and a guard that
 * silently equated them would let the map's nomenclature drift from the
 * router's, which is exactly the drift `screen.route` exists to pin.
 */
export function normaliseRoute(route) {
  let r = String(route).trim();
  if (r === "") return "";
  if (!r.startsWith("/")) r = `/${r}`;
  if (r.length > 1 && r.endsWith("/")) r = r.slice(0, -1);
  return r;
}

/** Parses the extractor's stdout: one route per line, `#` comments and blanks ignored. */
export function parseRouteList(text) {
  return [
    ...new Set(
      String(text)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"))
        .map(normaliseRoute)
        .filter((line) => line !== ""),
    ),
  ].sort();
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const PASS = "pass";
const FAIL = "fail";
const SKIP = "skip";

function check(id, title, status, lines = []) {
  return { id, title, status, lines };
}

/**
 * Runs every check and returns a structured verdict. Performs no process exit
 * and no annotation printing — the caller decides how loud to be, which is what
 * lets the test suite call this directly.
 *
 * @param {{
 *   repoRoot: string,
 *   flowsPath?: string,
 *   routesText?: string | null,
 *   validateDoc: (doc: unknown) => { valid: boolean, errors: {formatted: string}[] },
 * }} opts
 */
export function runGuard(opts) {
  const repoRoot = opts.repoRoot;
  const flowsRel = opts.flowsPath ?? DEFAULT_FLOWS_PATH;
  const flowsAbs = path.resolve(repoRoot, flowsRel);
  const checks = [];

  // 1. PRESENT ---------------------------------------------------------------
  if (!fs.existsSync(flowsAbs)) {
    checks.push(
      check("present", "flows.json is present", FAIL, [
        `${flowsRel} does not exist in this repository.`,
        `Every mapped app declares its screens and flows there. Create one with:`,
        `    npx @devfellowship/components ux-paths init`,
        `then fill in the screens — an empty stub does not pass check 4 either.`,
      ]),
    );
    return { ok: false, checks, doc: null };
  }
  checks.push(check("present", "flows.json is present", PASS, [flowsRel]));

  // 2. PARSES ----------------------------------------------------------------
  const raw = fs.readFileSync(flowsAbs, "utf8");
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (cause) {
    checks.push(
      check("parses", "flows.json is JSON", FAIL, [
        `${flowsRel} is not parseable JSON: ${cause.message}`,
      ]),
    );
    return { ok: false, checks, doc: null };
  }
  checks.push(check("parses", "flows.json is JSON", PASS, [`${raw.length} bytes`]));

  // 3. VALID -----------------------------------------------------------------
  const result = opts.validateDoc(doc);
  if (result.valid) {
    checks.push(
      check("valid", "flows.json conforms to the v1 schema", PASS, [
        `schema_version ${JSON.stringify(doc.schema_version)}`,
      ]),
    );
  } else {
    checks.push(
      check("valid", "flows.json conforms to the v1 schema", FAIL, [
        `${result.errors.length} schema violation${result.errors.length === 1 ? "" : "s"} in ${flowsRel}:`,
        ...result.errors.map((e) => `  - ${e.formatted}`),
      ]),
    );
  }

  const screens = Array.isArray(doc.screens) ? doc.screens : [];

  // 4. NON-EMPTY -------------------------------------------------------------
  if (screens.length === 0) {
    checks.push(
      check("non-empty", "flows.json declares at least one screen", FAIL, [
        `${flowsRel} declares zero screens.`,
        `A file with no screens is an un-filled \`init\` stub, not a map: it validates,`,
        `it renders as an empty canvas, and it reports nothing about the app.`,
      ]),
    );
  } else {
    checks.push(
      check("non-empty", "flows.json declares at least one screen", PASS, [
        `${screens.length} screen${screens.length === 1 ? "" : "s"}, ` +
          `${Array.isArray(doc.flows) ? doc.flows.length : 0} flow${
            Array.isArray(doc.flows) && doc.flows.length === 1 ? "" : "s"
          }`,
      ]),
    );
  }

  // 5. UNIQUE IDS ------------------------------------------------------------
  const seen = new Map();
  const duplicates = [];
  for (const screen of screens) {
    const id = screen?.id;
    if (typeof id !== "string") continue;
    if (seen.has(id)) duplicates.push(id);
    else seen.set(id, true);
  }
  if (duplicates.length > 0) {
    checks.push(
      check("unique-ids", "every screen.id is unique", FAIL, [
        `duplicate screen id${duplicates.length === 1 ? "" : "s"}: ${[...new Set(duplicates)].join(", ")}`,
        `\`screen.id\` is the schema's own "sticky 1:1 join key across apps". JSON Schema`,
        `cannot express uniqueness across array items, so a duplicate validates cleanly`,
        `and then silently breaks every comparison and every annotation built on the join.`,
      ]),
    );
  } else if (screens.length > 0) {
    checks.push(check("unique-ids", "every screen.id is unique", PASS, [`${seen.size} distinct ids`]));
  } else {
    checks.push(check("unique-ids", "every screen.id is unique", SKIP, ["no screens to check"]));
  }

  // 6. WHOLE FLOWS -----------------------------------------------------------
  // A flow step is either a bare screen id (v1.0) or a `{screen, ...}` object
  // (v1.1). Reading `.screen` off a string is the mistake this normalisation
  // exists to stop — the same one `@devfellowship/ux-paths-spec` guards with its
  // exported `stepScreenId`.
  const declaredIds = new Set(screens.map((s) => s?.id).filter((id) => typeof id === "string"));
  const dangling = new Map();
  const flows = Array.isArray(doc.flows) ? doc.flows : [];
  flows.forEach((flow, i) => {
    const label = typeof flow?.name === "string" ? flow.name : `flows[${i}]`;
    const referenced = [
      flow?.start,
      ...(Array.isArray(flow?.steps) ? flow.steps : []).map((step) =>
        typeof step === "string" ? step : step?.screen,
      ),
    ];
    for (const id of referenced) {
      if (typeof id !== "string" || declaredIds.has(id)) continue;
      if (!dangling.has(id)) dangling.set(id, new Set());
      dangling.get(id).add(label);
    }
  });
  if (flows.length === 0) {
    checks.push(check("whole-flows", "every flow step names a declared screen", SKIP, ["no flows declared"]));
  } else if (dangling.size > 0) {
    checks.push(
      check("whole-flows", "every flow step names a declared screen", FAIL, [
        `${dangling.size} screen id${dangling.size === 1 ? "" : "s"} referenced by a flow that no screen declares:`,
        ...[...dangling].map(([id, where]) => `  - "${id}"   (referenced by: ${[...where].join(", ")})`),
        ``,
        `JSON Schema cannot express a cross-reference, so a flow pointing at a deleted`,
        `screen validates cleanly and then renders as a broken edge in the atlas.`,
      ]),
    );
  } else {
    checks.push(
      check("whole-flows", "every flow step names a declared screen", PASS, [
        `${flows.length} flow${flows.length === 1 ? "" : "s"}, every step resolved`,
      ]),
    );
  }

  // 7. LIVE REFS -------------------------------------------------------------
  const refs = [];
  for (const screen of screens) {
    const ref = screen?.source_ref;
    if (!ref || typeof ref !== "object") continue;
    if (typeof ref.component_file === "string") {
      refs.push({ screen: screen.id, field: "source_ref.component_file", file: ref.component_file });
    }
    if (Array.isArray(ref.file_path_chain)) {
      ref.file_path_chain.forEach((file, i) => {
        if (typeof file === "string") {
          refs.push({ screen: screen.id, field: `source_ref.file_path_chain[${i}]`, file });
        }
      });
    }
  }
  const dead = refs.filter(({ file }) => !fs.existsSync(path.resolve(repoRoot, file)));
  if (refs.length === 0) {
    checks.push(
      check("live-refs", "every source_ref points at a file that exists", SKIP, [
        `no screen declares source_ref.component_file, so there is nothing to resolve.`,
        `This is a HOLE, not a pass: without source_ref nothing links a screen to the`,
        `code that renders it, and the map cannot go stale in the one way this check sees.`,
      ]),
    );
  } else if (dead.length > 0) {
    checks.push(
      check("live-refs", "every source_ref points at a file that exists", FAIL, [
        `${dead.length} of ${refs.length} source_ref path${refs.length === 1 ? "" : "s"} no longer exist:`,
        ...dead.map((d) => `  - screen "${d.screen}" ${d.field} -> ${d.file}`),
        ``,
        `The map points at code that is gone. Either the file moved and flows.json was`,
        `not updated, or the screen was deleted and its entry was left behind.`,
      ]),
    );
  } else {
    checks.push(
      check("live-refs", "every source_ref points at a file that exists", PASS, [
        `${refs.length} path${refs.length === 1 ? "" : "s"} resolved, across ${
          new Set(refs.map((r) => r.screen)).size
        } screen(s)`,
      ]),
    );
  }

  // 8. ROUTE PARITY ----------------------------------------------------------
  if (opts.routesText === null || opts.routesText === undefined) {
    checks.push(
      check("route-parity", "declared routes match the routes in the code", SKIP, [
        `no route extractor configured (\`routes-command\` input is empty).`,
        `This check is the only one that notices a route ADDED to the app and never`,
        `declared. Without it, a screen can be missing from the map forever and every`,
        `other check stays green. Supply a command that prints one route per line.`,
      ]),
    );
  } else {
    const codeRoutes = parseRouteList(opts.routesText);
    const declaredPairs = screens
      .filter((s) => typeof s?.route === "string" && s.route.trim() !== "")
      .map((s) => ({ id: s.id, route: normaliseRoute(s.route) }));
    const declared = [...new Set(declaredPairs.map((p) => p.route))].sort();
    const routeless = screens.filter((s) => typeof s?.route !== "string" || s.route.trim() === "");

    const undeclared = codeRoutes.filter((r) => !declared.includes(r));
    const stale = declared.filter((r) => !codeRoutes.includes(r));

    if (codeRoutes.length === 0) {
      checks.push(
        check("route-parity", "declared routes match the routes in the code", FAIL, [
          `the route extractor printed no routes at all.`,
          `An extractor that returns nothing makes this check vacuously green in one`,
          `direction and fails every declared route in the other, so it is refused`,
          `outright. Fix the extractor, or remove \`routes-command\` and accept the SKIP.`,
        ]),
      );
    } else if (undeclared.length > 0 || stale.length > 0) {
      const lines = [];
      if (undeclared.length > 0) {
        lines.push(
          undeclared.length === 1
            ? `1 route exists in the code and is NOT declared:`
            : `${undeclared.length} routes exist in the code and are NOT declared:`,
          ...undeclared.map((r) => `  + ${r}`),
          `  -> the app grew and the map did not. Add a screen for each.`,
        );
      }
      if (stale.length > 0) {
        if (lines.length) lines.push(``);
        lines.push(
          stale.length === 1
            ? `1 declared route does NOT exist in the code:`
            : `${stale.length} declared routes do NOT exist in the code:`,
          ...stale.map((r) => {
            const ids = declaredPairs.filter((p) => p.route === r).map((p) => p.id);
            return `  - ${r}   (screen${ids.length === 1 ? "" : "s"}: ${ids.join(", ")})`;
          }),
          `  -> the map describes routes the app no longer serves.`,
        );
      }
      checks.push(check("route-parity", "declared routes match the routes in the code", FAIL, lines));
    } else {
      const note =
        routeless.length > 0
          ? `; ${routeless.length} screen(s) declare no route and were not compared (states/modals — see ADR-7)`
          : "";
      checks.push(
        check("route-parity", "declared routes match the routes in the code", PASS, [
          `${codeRoutes.length} route${codeRoutes.length === 1 ? "" : "s"} in the code, all declared${note}`,
        ]),
      );
    }
  }

  return { ok: checks.every((c) => c.status !== FAIL), checks, doc };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const ICON = { pass: "PASS", fail: "FAIL", skip: "SKIP" };

/** Human-readable report. Returned as a string so tests can assert on it. */
export function renderReport(verdict, specDescribe) {
  const out = [];
  out.push(`ux-paths guard`);
  out.push(`spec source: ${specDescribe}`);
  out.push(``);
  for (const c of verdict.checks) {
    out.push(`[${ICON[c.status]}] ${c.title}`);
    for (const line of c.lines) out.push(`       ${line}`);
  }
  out.push(``);
  const failed = verdict.checks.filter((c) => c.status === FAIL);
  const skipped = verdict.checks.filter((c) => c.status === SKIP);
  if (failed.length === 0) {
    out.push(
      `ux-paths guard PASSED (${verdict.checks.length - skipped.length} checks ran, ${skipped.length} skipped).`,
    );
  } else {
    out.push(`ux-paths guard FAILED: ${failed.map((c) => c.id).join(", ")}.`);
  }
  return out.join("\n");
}

/** GitHub Actions annotations — one per failing check, so they land on the run. */
export function renderAnnotations(verdict) {
  return verdict.checks
    .filter((c) => c.status === FAIL)
    .map((c) => {
      const body = [c.title, ...c.lines].join("%0A");
      return `::error title=ux-paths: ${c.id}::${body}`;
    });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { repoRoot: process.cwd(), flowsPath: DEFAULT_FLOWS_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new GuardSetupError(`${arg} needs a value`);
      i += 1;
      return v;
    };
    switch (arg) {
      case "--repo-root":
        args.repoRoot = next();
        break;
      case "--flows":
        args.flowsPath = next();
        break;
      case "--routes-file":
        args.routesFile = next();
        break;
      case "--spec-dir":
        args.specDir = next();
        break;
      case "--vendored-schema":
        args.vendoredSchema = next();
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new GuardSetupError(`unknown argument: ${arg}`);
    }
  }
  return args;
}

const USAGE = `ux-paths-guard — the CI gate for .dfl-ux-paths/flows.json

  --repo-root <dir>          repository to check (default: cwd)
  --flows <path>             flows document, relative to repo-root
                             (default: ${DEFAULT_FLOWS_PATH})
  --routes-file <path>       file holding one route per line, produced by the
                             repo's own extractor. Absent -> route parity SKIPs.
  --spec-dir <dir>           directory whose node_modules holds either
                             @devfellowship/ux-paths-spec or ajv + ajv-formats
  --vendored-schema <path>   fallback schema (default: <guard repo>/schema/ux-paths-v1.json)

Exit: 0 pass, 1 a check failed, 2 the guard could not run.`;

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::${e.message}`);
    console.error(USAGE);
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  // The vendored schema lives beside this script, in the guard's own repo —
  // never in the repo being checked, which does not have one.
  const guardRepoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  let spec;
  try {
    spec = await loadSpec({
      specDir: args.specDir,
      vendoredSchema: args.vendoredSchema,
      cwd: guardRepoRoot,
    });
  } catch (e) {
    console.error(`::error title=ux-paths: setup::${e.message}`);
    process.exit(2);
  }

  let routesText = null;
  if (args.routesFile) {
    const abs = path.resolve(args.repoRoot, args.routesFile);
    if (!fs.existsSync(abs)) {
      console.error(
        `::error title=ux-paths: setup::routes file ${abs} does not exist — the extractor named by ` +
          `\`routes-command\` did not write it. A silently missing extractor would downgrade route ` +
          `parity to SKIP and hide the very drift it exists to catch, so this is a hard stop.`,
      );
      process.exit(2);
    }
    routesText = fs.readFileSync(abs, "utf8");
  }

  const verdict = runGuard({
    repoRoot: args.repoRoot,
    flowsPath: args.flowsPath,
    routesText,
    validateDoc: spec.validate,
  });

  const report = renderReport(verdict, spec.describe);
  console.log(report);
  for (const annotation of renderAnnotations(verdict)) console.log(annotation);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ux-paths guard\n\n\`\`\`\n${report}\n\`\`\`\n`,
    );
  }

  process.exit(verdict.ok ? 0 : 1);
}

// Run only when executed directly, so the test suite can import the checks.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
