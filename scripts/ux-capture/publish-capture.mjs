#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAPTURE PUBLISHES ITSELF — media, then the index. No human in the loop.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Closes P6/P8 of plan `20260812-ux-map-observed-reality-lens`.
 *
 * ## The hole this fills
 *
 * `.github/workflows/ux-capture.yml` ran green every time and its ONLY output
 * was `actions/upload-artifact@v4`, which expires after 30 days. It never
 * uploaded anything to media and never wrote a row in `engineering.ux_map_*`.
 * Every row that existed in the production index was put there by hand, from a
 * developer host. So the weekly cron fed nothing, and the question the whole
 * plan exists to answer — *is this screen changed since it was validated?* —
 * was asked against an index that nothing refreshed.
 *
 * This script is the missing half. Run it after `run-capture.sh` and the
 * capture is on media and in the index, addressed by digest.
 *
 * ## What it does, in order
 *
 *   1. reads `published-screens.json` — the artifact-directory → screen-id map
 *   2. proves every mapped id is DECLARED in `.dfl-ux-paths/flows.json`, and
 *      that every mapped directory really holds both files
 *   3. mints a user session (password grant) unless one is handed to it
 *   4. uploads every screenshot + regions.json through the `upload-file` edge
 *      function, and collects the `media.devfellowship.com/<id>` links
 *   5. hands those links to `emit-observed-flows.ts` — the SAME emitter the
 *      authenticated run uses — to produce the observed flows document
 *   6. uploads that document too
 *   7. calls `engineering.index_ux_map_capture` with the sha256 of the exact
 *      bytes it uploaded
 *
 * ## 🔑 Credentials — a person's session, never a service key
 *
 * The index write goes through `engineering.index_ux_map_capture`, a SECURITY
 * DEFINER function that takes the writer from `auth.uid()` and admits DFL
 * members (IAM global level ≥ 50). There is no `service_role` path here and
 * there must not be one: the migration that created the function
 * (`dfl-schema` 20260813235500) removed the service_role requirement on
 * purpose, and restoring it in a caller would quietly undo that.
 *
 * So this needs a real account. In CI it is `CLAUDE_SMOKE_*` — the DFL probe
 * identity, already a repo Actions secret here for `e2e.yml`, already IAM
 * level 50, and already the account that indexed every existing row of this
 * table. Nothing about the identity changes when the writer stops being a
 * person typing the command.
 *
 * ⚠️ A token is never printed. Failures name the HTTP status and the account
 * EMAIL, never the secret.
 *
 * ## ⚠️ Two properties to know before you read the output
 *
 * **A run of an unchanged application still writes a new capture row.** The
 * observed document embeds the media URL of each screenshot, and an upload
 * mints a fresh media id every time, so the document's bytes — and therefore
 * its digest, which IS the version key (ADR-3) — differ week to week even when
 * no pixel moved. What does NOT drift is `ux_map_screens.screenshot_digest`,
 * which is computed from the local image bytes; so "which screens changed"
 * stays correct and it is only the row count that is generous. Fixing it means
 * reusing a previous upload's URL when the image digest is unchanged, which is
 * a read this script deliberately does not yet do.
 *
 * **Coverage is 2 of 31, and it is published as 2 of 31.** See
 * `published-screens.json`.
 *
 * ## Usage
 *
 *   node scripts/ux-capture/publish-capture.mjs \
 *     --out capture-out --commit-sha "$GITHUB_SHA" [--dry-run]
 *
 * Environment:
 *   DFL_SUPABASE_URL        (default: the DFL production project)
 *   DFL_SUPABASE_ANON_KEY   required — the `apikey` ticket to the API
 *   DFL_SUPABASE_USER_JWT   a session to use as-is; OR
 *   DFL_CAPTURE_USERNAME / DFL_CAPTURE_PASSWORD   to mint one
 *
 * `--dry-run` needs no credential at all: it validates the map, stages the
 * files and prints the payload that WOULD be sent.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_SUPABASE_URL = 'https://yoojxnggaxcqtsyjdrdx.supabase.co';
const APP_DISPLAY_NAME = 'ITERA Player';
const REPO_FULL_NAME = 'iterahq/itera-player';

/** The keys `index_ux_map_capture` accepts on a screen. It REFUSES any other. */
const SCREEN_KEYS = [
  'screen_id',
  'name',
  'route',
  'screenshot_url',
  'screenshot_media_id',
  'screenshot_digest',
  'regions_url',
  'regions_media_id',
  'source_ref_file',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  if (fallback !== undefined) return fallback;
  fail(`--${name} is required`);
}

const flag = (name) => process.argv.includes(`--${name}`);

function fail(message, detail) {
  console.error(`::error title=ux-capture publish::${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/**
 * `emit-observed-flows.ts` is TypeScript and this step runs with NO
 * `node_modules` — deliberately, for the same reason `ux-paths.yml` refuses to
 * `npm ci` for a gate. Node strips types natively from 22.18, which is what
 * lets the emitter be REUSED verbatim instead of copied into a second spelling
 * that can drift from the one the authenticated run uses.
 *
 * Checked here, by name, because the alternative failure is a SyntaxError
 * pointing at an `interface` line, which reads as a broken script.
 */
function assertTypeStripping() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 18)) return;
  fail(
    `node ${process.versions.node} cannot run scripts/ux-capture/emit-observed-flows.ts: ` +
      `native TypeScript stripping needs 22.18 or newer. The workflow pins ` +
      `.node-version; check that actions/setup-node resolved it.`
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Supabase
// ───────────────────────────────────────────────────────────────────────────

/**
 * Password grant. The refresh-token dance `supabase-upload` performs on a
 * developer host has nothing to cache here — a CI job starts with no session
 * and ends with none.
 */
async function mintSession(url, anonKey, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    fail(
      `could not sign in as ${email} — HTTP ${res.status}. The index write needs a real ` +
        `DFL member session; there is no service_role fallback and there must not be one.`,
      (await res.text()).slice(0, 300)
    );
  }
  const body = await res.json();
  if (!body.access_token) fail(`sign-in as ${email} returned no access_token`);
  return body.access_token;
}

/**
 * One file to media, through the `upload-file` edge function. PRIVATE by
 * default: the returned `media.devfellowship.com/<id>` link is permanent and
 * fetches without a login, while the S3 object behind it is signed per access.
 */
async function upload(url, anonKey, jwt, filePath, uploadName, contentType) {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append('file', new File([bytes], uploadName, { type: contentType }));
  form.append('visibility', 'private');

  const res = await fetch(`${url}/functions/v1/upload-file`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    fail(`upload of ${uploadName} failed — HTTP ${res.status}`, text.slice(0, 300));
  }
  const body = JSON.parse(text);
  if (!body.url || !body.id) {
    fail(`upload of ${uploadName} returned no url/id`, text.slice(0, 300));
  }
  return { url: body.url, media_id: body.id };
}

/**
 * The ONE write path. PostgREST addresses a non-default schema by header, and
 * an RPC is a POST — so it needs `Content-Profile` as well as `Accept-Profile`.
 * With only the latter the call resolves against `public`, where no such
 * function exists, and comes back as a 404 about a missing function instead of
 * as the schema mistake it is.
 */
async function indexCapture(url, anonKey, jwt, payload) {
  const res = await fetch(`${url}/rest/v1/rpc/index_ux_map_capture`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Profile': 'engineering',
      'Accept-Profile': 'engineering',
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    const code = (() => {
      try {
        return JSON.parse(text).code ?? null;
      } catch {
        return null;
      }
    })();
    if (code === '42883' || code === 'PGRST202') {
      fail(
        `engineering.index_ux_map_capture does not exist on this project — the dfl-schema ` +
          `migration 20260813235500_engineering_ux_map_index_rpc.sql is not applied. There ` +
          `is deliberately no fallback to a direct table INSERT: that path is the one that ` +
          `needed service_role.`,
        text.slice(0, 400)
      );
    }
    if (code === '42501') {
      fail(
        `refused by the database: the account this job signed in as is not a DFL member ` +
          `(IAM global level 50 or above). The gate is inside the function and it is not ` +
          `something a caller can work around.`,
        text.slice(0, 400)
      );
    }
    fail(`index_ux_map_capture → HTTP ${res.status}`, text.slice(0, 400));
  }
  const raw = JSON.parse(text);
  return Array.isArray(raw) ? raw[0] : raw;
}

// ───────────────────────────────────────────────────────────────────────────

async function main() {
  assertTypeStripping();

  const outDir = path.resolve(arg('out'));
  const flowsPath = path.resolve(arg('flows', path.join(REPO_ROOT, '.dfl-ux-paths', 'flows.json')));
  const commitSha = arg('commit-sha', '').toLowerCase();
  const dryRun = flag('dry-run');

  if (!existsSync(outDir)) fail(`no capture output at ${outDir}`);

  const mapPath = path.join(HERE, 'published-screens.json');
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  const role = map.role;
  const flows = JSON.parse(await readFile(flowsPath, 'utf8'));
  const declared = new Map(flows.screens.map((s) => [s.id, s]));

  // ── The map is proved, not trusted ───────────────────────────────────────
  // Both directions. An id that stopped being declared, and a directory that
  // stopped being produced, are the two ways this silently degrades into
  // "published a row with no pictures in it".
  const problems = [];
  for (const [screenId, relDir] of Object.entries(map.screens)) {
    if (!declared.has(screenId)) {
      problems.push(
        `${screenId} is mapped from ${relDir} but is NOT declared in ${path.relative(REPO_ROOT, flowsPath)}`
      );
      continue;
    }
    for (const file of ['screenshot.png', 'regions.json']) {
      const p = path.join(outDir, relDir, file);
      if (!existsSync(p)) {
        problems.push(`${screenId}: the capture produced no ${relDir}/${file}`);
      }
    }
  }
  if (problems.length) {
    fail(
      `${problems.length} entr${problems.length === 1 ? 'y' : 'ies'} in ` +
        `scripts/ux-capture/published-screens.json no longer describe the capture. ` +
        `Fix the DATA — do not widen the check.`,
      problems.map((p) => `  · ${p}`).join('\n')
    );
  }

  // ── Stage, so the emitter sees the layout it was written for ─────────────
  // `emit-observed-flows.ts` reads `<captures>/<screen_id>/screenshot.png`,
  // keyed by DECLARED id. The hermetic harness names its directories after its
  // own screens (`regions/not-found`, not `not_found`). Copying is cheaper than
  // teaching a second layout to the emitter that the authenticated run shares.
  const stageDir = path.join(outDir, '.publish');
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  const staged = [];
  for (const [screenId, relDir] of Object.entries(map.screens)) {
    const dst = path.join(stageDir, screenId);
    await mkdir(dst, { recursive: true });
    const png = path.join(dst, 'screenshot.png');
    const regions = path.join(dst, 'regions.json');
    await copyFile(path.join(outDir, relDir, 'screenshot.png'), png);
    await copyFile(path.join(outDir, relDir, 'regions.json'), regions);
    staged.push({ screenId, png, regions });
  }

  // ── Credentials ──────────────────────────────────────────────────────────
  const supabaseUrl = (process.env.DFL_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anonKey = process.env.DFL_SUPABASE_ANON_KEY;
  let jwt = process.env.DFL_SUPABASE_USER_JWT;

  if (!dryRun) {
    if (!anonKey) {
      fail(
        'DFL_SUPABASE_ANON_KEY is not set. Both halves of publishing need it: the ' +
          '`apikey` header on the upload edge function and on PostgREST.'
      );
    }
    if (!jwt) {
      const email = process.env.DFL_CAPTURE_USERNAME;
      const password = process.env.DFL_CAPTURE_PASSWORD;
      if (!email || !password) {
        fail(
          'no writer. Set DFL_SUPABASE_USER_JWT, or DFL_CAPTURE_USERNAME + ' +
            'DFL_CAPTURE_PASSWORD. engineering.index_ux_map_capture stamps the row from ' +
            'auth.uid(), so an anonymous request has no uid to record and is refused.'
        );
      }
      jwt = await mintSession(supabaseUrl, anonKey, email, password);
      console.log(`signed in as ${email}`);
    }
  }

  // ── Upload every pair ────────────────────────────────────────────────────
  const uploads = {};
  const perScreen = new Map();
  for (const { screenId, png, regions } of staged) {
    const digest = sha256(await readFile(png));
    if (dryRun) {
      perScreen.set(screenId, { digest, shot: null, regions: null });
      continue;
    }
    const shot = await upload(
      supabaseUrl,
      anonKey,
      jwt,
      png,
      `itera-player.${role}.${screenId}.png`,
      'image/png'
    );
    const reg = await upload(
      supabaseUrl,
      anonKey,
      jwt,
      regions,
      `itera-player.${role}.${screenId}.regions.json`,
      'application/json'
    );
    // The emitter looks the PNG up by its ABSOLUTE staged path.
    uploads[png] = { url: shot.url, media_id: shot.media_id };
    perScreen.set(screenId, { digest, shot, regions: reg });
    console.log(`uploaded ${screenId}  ${shot.url}`);
  }

  const uploadsPath = path.join(stageDir, 'uploads.json');
  await writeFile(uploadsPath, `${JSON.stringify(uploads, null, 2)}\n`, 'utf8');

  // The emitter reads only `screen_id` and `verdict`. Every DECLARED screen is
  // listed, including the ones this substrate cannot reach — the empty
  // `screenshots[]` they get is the coverage signal, not an omission.
  await writeFile(
    path.join(stageDir, 'capture-manifest.json'),
    `${JSON.stringify(
      {
        role,
        declared: flows.screens.length,
        captured: staged.length,
        screens: flows.screens.map((s) => ({
          screen_id: s.id,
          verdict: map.screens[s.id] ? 'captured' : 'not-attempted',
          landed: null,
          regions: null,
          note: map.screens[s.id]
            ? null
            : 'behind a session, a :param, or proved by marker rather than photographed',
        })),
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  // ── The observed document, from the shared emitter ───────────────────────
  const docPath = path.join(outDir, `itera-player.observed.${role}.flows.json`);
  const emit = spawnSync(
    process.execPath,
    [
      path.join(HERE, 'emit-observed-flows.ts'),
      '--captures',
      stageDir,
      '--uploads',
      uploadsPath,
      '--role',
      role,
      '--out',
      docPath,
      '--flows',
      flowsPath,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  process.stdout.write(emit.stdout ?? '');
  if (emit.status !== 0) {
    fail('emit-observed-flows.ts failed', emit.stderr ?? '');
  }

  const docBytes = await readFile(docPath);
  const digest = sha256(docBytes);

  // ── The index payload ────────────────────────────────────────────────────
  const withShot = [...perScreen.values()].filter((v) => v.shot || dryRun).length;
  const screens = flows.screens.map((s) => {
    const got = perScreen.get(s.id);
    const row = {
      screen_id: s.id,
      name: s.name ?? null,
      route: s.route ?? null,
      screenshot_url: got?.shot?.url ?? null,
      screenshot_media_id: got?.shot?.media_id ?? null,
      screenshot_digest: got?.digest ?? null,
      regions_url: got?.regions?.url ?? null,
      regions_media_id: got?.regions?.media_id ?? null,
      source_ref_file: s.source_ref?.component_file ?? null,
    };
    for (const k of Object.keys(row)) {
      if (!SCREEN_KEYS.includes(k)) fail(`screen key "${k}" is not one the RPC accepts`);
    }
    return row;
  });

  const coverageNote =
    `${map.substrate} substrate, session=none, published by the ux-capture workflow ` +
    `(.github/workflows/ux-capture.yml). ${withShot} of ${flows.screens.length} declared ` +
    `screens carry a screenshot: 24 redirect to /login without a session, and 5 of the 7 ` +
    `that render are proved by marker and settle measurement rather than photographed. ` +
    `The role is "${role}" and not "anonymous" on purpose — a signed-out capture of the ` +
    `LIVE substrate exists under "anonymous" with wider coverage, and the lens reads the ` +
    `newest capture per app and role.`;

  const payload = {
    p_app_id: flows.app_id,
    p_role: role,
    p_digest: digest,
    p_artifact_url: null,
    p_screens: screens,
    p_display_name: APP_DISPLAY_NAME,
    p_repo_full_name: REPO_FULL_NAME,
    p_artifact_media_id: null,
    p_app_version: flows.app_version ?? null,
    p_commit_sha: /^[0-9a-f]{7,40}$/.test(commitSha) ? commitSha : null,
    p_coverage_note: coverageNote,
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        { dry_run: true, digest, role, screens_total: screens.length, screens_with_shot: withShot },
        null,
        2
      )
    );
    return;
  }

  const artifact = await upload(
    supabaseUrl,
    anonKey,
    jwt,
    docPath,
    path.basename(docPath),
    'application/json'
  );
  payload.p_artifact_url = artifact.url;
  payload.p_artifact_media_id = artifact.media_id;
  console.log(`uploaded the observed document  ${artifact.url}`);

  const result = await indexCapture(supabaseUrl, anonKey, jwt, payload);
  if (!result?.capture_id) {
    fail('index_ux_map_capture returned no capture', JSON.stringify(result).slice(0, 400));
  }
  // The version key must be the one WE computed. If the row came back keyed on
  // anything else, the two halves disagree about what a version is, and every
  // later "did this change" answer is drawn from the wrong baseline.
  if (result.digest && result.digest !== digest) {
    fail(`the indexed digest (${result.digest}) is not the digest of the document sent (${digest})`);
  }

  // Written into the capture output so it rides along in the run artifact —
  // the run log expires, and this is the evidence that the loop closed.
  const record = {
    capture_id: result.capture_id,
    app_uuid: result.app_uuid,
    digest,
    role,
    run_id: result.run_id ?? null,
    already_indexed: result.already_indexed === true,
    indexed_by: result.indexed_by ?? null,
    screens_total: result.screens_total ?? screens.length,
    screens_with_shot: result.screens_with_shot ?? withShot,
    artifact_url: artifact.url,
    screenshots: Object.fromEntries(
      [...perScreen.entries()].map(([id, v]) => [id, v.shot?.url ?? null])
    ),
  };
  await writeFile(
    path.join(outDir, 'index-result.json'),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(record, null, 2));

  // Reported from what the DATABASE stored, never from what this process meant
  // to send. A run that reached 2 of 31 says so instead of implying completeness.
  console.log(
    `coverage: ${record.screens_with_shot}/${record.screens_total} screens carry a screenshot`
  );
  if (record.screens_total !== screens.length) {
    fail(
      `sent ${screens.length} screens, the index holds ${record.screens_total} for this capture`
    );
  }
}

main().catch((e) => fail(e?.message ?? String(e), e?.stack));
