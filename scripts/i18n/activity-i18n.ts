#!/usr/bin/env -S npx tsx
/**
 * activity-i18n — audit / backfill / revert the EN locale of authored activity content.
 *
 * ## The problem this solves
 *
 * Authored content lives as free-form jsonb in `itera.activities.spec|rubric` and
 * `itera.activity_defs.spec|rubric|title_i18n`. Two shapes coexist at the same
 * paths, both live in production:
 *
 *     "text": "Onde o Claude Code roda?"                       // plain — no EN at all
 *     "text": { "pt": "Onde…", "en": "Where…" }                // bag  — bilingual
 *
 * Most content was authored PT-only. Where an EN slot existed at all it was very
 * often filled by MIRRORING the Portuguese verbatim (`en === pt`), which reads as
 * "translated" to every automated check while showing an English-speaking learner
 * Portuguese. This script measures both failure modes and fixes them from a
 * reviewed, committed translation map.
 *
 * ## Commands
 *
 *     ITERA_DB_URL=… npx tsx scripts/i18n/activity-i18n.ts audit [--json]
 *     ITERA_DB_URL=… npx tsx scripts/i18n/activity-i18n.ts apply [--dry-run] [--limit N]
 *     ITERA_DB_URL=… npx tsx scripts/i18n/activity-i18n.ts revert --batch <uuid>
 *     ITERA_DB_URL=… npx tsx scripts/i18n/activity-i18n.ts extract > new-strings.json
 *
 * - **audit** — counts rows/strings still lacking a real EN, and the coverage of
 *   `translations.en.json` against what is actually in the DB. This is the
 *   before/after verification tool; it writes nothing.
 * - **extract** — dumps every PT string that still needs a translation, in the
 *   batch format the translation step consumes. Run this when new activities land:
 *   translate the output, merge into `translations.en.json`, re-run `apply`.
 * - **apply** — snapshots every touched row into `itera.activity_i18n_backup`
 *   under a fresh `batch_id`, then rewrites the jsonb. Prints the batch id.
 * - **revert** — restores every row captured under a batch id, verbatim.
 *
 * `apply` is **idempotent**: a row already carrying the target EN produces no
 * change and is not re-snapshotted (the backup table has a unique index on
 * `(batch_id, source_table, row_id)`).
 *
 * ## What is deliberately NOT translated
 *
 * `DENY_PATHS` covers values that are machine literals rather than prose. Code the
 * learner edits (`spec.starter`), the assertions that grade it
 * (`spec.checks[].assert.*`, `spec.checks[].steps[].value`), machine-parsed rubric
 * fields (`rubric.tests[]`, `rubric.parse[]`), and simulated terminal output
 * (`spec.initialState.cannedResults.*.text`, which is real git output and already
 * English). Translating any of these silently breaks grading. The matching
 * `.critique` fields ARE prose and ARE translated.
 *
 * `DENY_KINDS` excludes the `code` kind entirely — see the comment on that
 * constant for why a half-translated code snack is worse than an untranslated one.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRANSLATIONS_PATH = join(HERE, 'translations.en.json');

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Bag = { pt?: string; en?: string; es?: string };

const BAG_KEYS = new Set(['pt', 'en', 'es']);

/**
 * Mirror of `isLocaleBag` in `src/utils/resolveLocalizedSpec.ts` — every key a
 * known locale, every value a string, at least one of pt/en. Kept in sync
 * deliberately: the writer here and the reader there must agree on what a bag is,
 * or the backfill writes a shape the player cannot resolve.
 *
 * (`es` is accepted here but never written; the player's reader is pt/en only.)
 */
function isBag(v: unknown): v is Bag {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return false;
  let hasPtOrEn = false;
  for (const [k, val] of entries) {
    if (!BAG_KEYS.has(k)) return false;
    if (typeof val !== 'string') return false;
    if (k === 'pt' || k === 'en') hasPtOrEn = true;
  }
  return hasPtOrEn;
}

/** Collapse `foo[3].bar` → `foo[].bar` so paths group across array indices. */
const normPath = (p: string) => p.replace(/\[\d+\]/g, '[]');

/** Paths whose values are machine literals — never translated. See the docblock. */
const DENY_PATHS = new Set([
  '.spec.starter',
  '.spec.checks[].assert.equals',
  '.spec.checks[].assert.contains',
  '.spec.checks[].steps[].value',
  '.rubric.tests[]',
  '.rubric.parse[]',
]);

/**
 * Kinds excluded from the backfill WHOLESALE, and why.
 *
 * `code` — a code snack is a three-way coupling that only works if all three
 * sides agree: the starter source the learner edits
 * (`{ titulo: 'Matemática' }`), the assertion that grades it
 * (`assert.equals: 'Matemática'`, matched against rendered DOM text), and the
 * hint/label that describe it ("O terceiro card é 'Ciências'"). The first two are
 * code, not prose, and are on the deny list — translating only the third would
 * leave a hint that says "the third card is 'Sciences'" next to an editor showing
 * `Ciências`, which is worse than leaving the activity alone: it reads as a bug to
 * the learner while the grader silently still passes.
 *
 * Translating a code snack properly means translating the starter's data
 * literals and their assertions in lockstep, per activity — a different job with a
 * different failure mode (a wrong pair silently breaks a graded exercise). It is
 * deliberately NOT bundled here. These activities stay fully Portuguese, which is
 * at least internally coherent, until that work is done.
 */
const DENY_KINDS = new Set(['code']);

function isDenied(path: string): boolean {
  const n = normPath(path);
  if (DENY_PATHS.has(n)) return true;
  // Simulated terminal output — real git output, already English, and asserted
  // against verbatim by the scenario. Only the sibling `.critique` is prose.
  if (n.startsWith('.spec.initialState.cannedResults.') && n.endsWith('.text')) return true;
  return false;
}

// Portuguese detection. Diacritics are decisive on their own; otherwise require
// two unambiguous PT function words so English strings that merely contain "a"
// or "e" are not misread as Portuguese.
const PT_DIACRITICS = /[çãõáéíóúâêôàÇÃÕÁÉÍÓÚÂÊÔÀ]/;
const PT_WORDS =
  /\b(você|vocês|atividade|código|não|então|qual|quais|isso|este|esta|mais|como|porque|sobre|quando|onde|pelo|pela|são|está|estão|ser|fazer|usar|cada|entre|depois|antes|também|uma|que|para|com|seu|sua|dos|das|nos|nas|ele|ela|muito|todo|toda|todos|todas|já|ainda|apenas|deve|pode|precisa|vai|foi|tem|será|sem|até|durante|enquanto|mas|ou|se|ao|à)\b/gi;

function looksPortuguese(s: string): boolean {
  if (PT_DIACRITICS.test(s)) return true;
  return (s.match(PT_WORDS) ?? []).length >= 2;
}

const keyOf = (pt: string) => createHash('sha1').update(pt, 'utf8').digest('hex').slice(0, 12);

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

type Slot =
  | { kind: 'bag'; path: string; pt: string; en: string }
  | { kind: 'plain'; path: string; pt: string };

/**
 * Every position in `node` that carries authored text needing an EN counterpart:
 * a bag whose `en` is missing or mirrors `pt`, or a bare Portuguese string.
 * Denied paths are skipped entirely.
 */
function* untranslatedSlots(node: Json, path = ''): Generator<Slot> {
  if (isBag(node)) {
    const pt = (node.pt ?? '').trim();
    const en = (node.en ?? '').trim();
    if (pt && (!en || en === pt) && !isDenied(path)) yield { kind: 'bag', path, pt, en };
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* untranslatedSlots(node[i], `${path}[${i}]`);
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) yield* untranslatedSlots(v, `${path}.${k}`);
    return;
  }
  if (typeof node === 'string' && node.trim() && looksPortuguese(node) && !isDenied(path)) {
    yield { kind: 'plain', path, pt: node };
  }
}

/**
 * Rewrite `node`, filling EN from `map`. Plain PT strings become bags; mirrored
 * bags get a real `en`. Returns the same reference when nothing changed, so an
 * untouched row produces no UPDATE.
 */
function fillEnglish(node: Json, map: TranslationMap, path = '', stats?: { filled: number }): Json {
  if (isBag(node)) {
    const pt = (node.pt ?? '').trim();
    const en = (node.en ?? '').trim();
    if (!pt || (en && en !== pt) || isDenied(path)) return node;
    const t = map[keyOf(pt)];
    if (!t || t.en === en) return node;
    if (stats) stats.filled++;
    return { ...node, pt: node.pt as string, en: t.en };
  }
  if (Array.isArray(node)) {
    let changed = false;
    const out = node.map((item, i) => {
      const next = fillEnglish(item, map, `${path}[${i}]`, stats);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : node;
  }
  if (node !== null && typeof node === 'object') {
    let changed = false;
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(node)) {
      const next = fillEnglish(v, map, `${path}.${k}`, stats);
      if (next !== v) changed = true;
      out[k] = next;
    }
    return changed ? out : node;
  }
  if (typeof node === 'string' && node.trim() && looksPortuguese(node) && !isDenied(path)) {
    const t = map[keyOf(node)];
    // A translation identical to the source means "intentionally the same"
    // (a command, an identifier, a proper noun). Leave it a plain string rather
    // than manufacturing a bag whose two sides are equal.
    if (!t || t.en === node) return node;
    if (stats) stats.filled++;
    return { pt: node, en: t.en };
  }
  return node;
}

// ---------------------------------------------------------------------------
// DB plumbing (same convention as db/seeds/fellowship-pilot.ts: psql + ITERA_DB_URL)
// ---------------------------------------------------------------------------

function dbUrl(): string {
  const v = process.env.ITERA_DB_URL;
  if (!v) {
    throw new Error(
      'ITERA_DB_URL is required. Obtain it from Infisical /apps/itera via the credentials-lookup skill; never hardcode it.'
    );
  }
  if (v.includes('yoojxnggaxcqtsyjdrdx')) {
    throw new Error('Refusing to run: ITERA_DB_URL points at DFL prod, not the Itera project.');
  }
  return v;
}

function psql(sql: string, { file = false }: { file?: boolean } = {}): string {
  const args = file
    ? [dbUrl(), '-v', 'ON_ERROR_STOP=1', '-f', sql]
    : [dbUrl(), '-v', 'ON_ERROR_STOP=1', '-tAc', sql];
  const res = spawnSync('psql', args, { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`psql failed: ${res.stderr || res.stdout}`);
  return (res.stdout || '').trim();
}

/** Read a whole result set as JSON, base64-framed so newlines in content cannot corrupt it. */
function queryJson<T>(selectExpr: string): T[] {
  const sql = `COPY (SELECT replace(encode(convert_to(coalesce(jsonb_agg(x), '[]'::jsonb)::text,'UTF8'),'base64'), E'\\n','') FROM (${selectExpr}) x) TO STDOUT`;
  const b64 = psql(sql).replace(/\n/g, '');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')) as T[];
}

/** Dollar-quote a literal with a tag proven absent from the payload. */
function dollar(s: string): string {
  let tag = 'j';
  while (s.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${s}$${tag}$`;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  kind: string;
  spec: Json;
  rubric: Json;
  title_i18n?: Json;
}

const SOURCES = [
  {
    table: 'activities',
    select: `SELECT id, kind::text AS kind, spec, rubric FROM itera.activities`,
    hasTitle: false,
  },
  {
    table: 'activity_defs',
    select: `SELECT id, kind::text AS kind, spec, rubric, title_i18n FROM itera.activity_defs`,
    hasTitle: true,
  },
] as const;

type TranslationMap = Record<string, { pt: string; en: string }>;

function loadMap(): TranslationMap {
  try {
    return JSON.parse(readFileSync(TRANSLATIONS_PATH, 'utf-8')) as TranslationMap;
  } catch {
    return {};
  }
}

/** The document a row contributes to the walk — title_i18n included where it exists. */
function docOf(row: Row, hasTitle: boolean): Record<string, Json> {
  const doc: Record<string, Json> = { spec: row.spec, rubric: row.rubric };
  if (hasTitle) doc.title_i18n = row.title_i18n ?? {};
  return doc;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdAudit(asJson: boolean): void {
  const map = loadMap();
  const report: Record<string, unknown> = {};
  let grandRows = 0;
  let grandBadRows = 0;
  let grandSlots = 0;
  let grandCovered = 0;
  let grandSkippedKind = 0;

  for (const src of SOURCES) {
    const rows = queryJson<Row>(src.select);
    let badRows = 0;
    let skippedKindRows = 0;
    let mirroredBags = 0;
    let plainStrings = 0;
    let covered = 0;
    const byPath: Record<string, number> = {};

    for (const row of rows) {
      if (DENY_KINDS.has(row.kind)) {
        skippedKindRows++;
        continue;
      }
      const slots = [...untranslatedSlots(docOf(row, src.hasTitle) as Json)];
      if (slots.length) badRows++;
      for (const s of slots) {
        if (s.kind === 'bag') mirroredBags++;
        else plainStrings++;
        byPath[normPath(s.path)] = (byPath[normPath(s.path)] ?? 0) + 1;
        // A map entry whose EN equals the PT is a deliberate "leave as-is"
        // (command / identifier / proper noun), so it counts as covered.
        if (map[keyOf(s.pt)]) covered++;
      }
    }
    const slots = mirroredBags + plainStrings;
    report[src.table] = {
      rows: rows.length,
      rows_needing_en: badRows,
      rows_clean: rows.length - badRows - skippedKindRows,
      rows_skipped_by_kind: skippedKindRows,
      slots_needing_en: slots,
      mirrored_bags: mirroredBags,
      plain_pt_strings: plainStrings,
      covered_by_map: covered,
      uncovered: slots - covered,
      by_path: Object.fromEntries(Object.entries(byPath).sort((a, b) => b[1] - a[1])),
    };
    grandRows += rows.length;
    grandSkippedKind += skippedKindRows;
    grandBadRows += badRows;
    grandSlots += slots;
    grandCovered += covered;
  }

  report.total = {
    rows: grandRows,
    rows_needing_en: grandBadRows,
    slots_needing_en: grandSlots,
    rows_skipped_by_kind: grandSkippedKind,
    covered_by_map: grandCovered,
    uncovered: grandSlots - grandCovered,
    translation_map_entries: Object.keys(map).length,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  for (const src of SOURCES) {
    const r = report[src.table] as Record<string, number>;
    console.log(`\nitera.${src.table}`);
    console.log(`  rows                 ${r.rows}`);
    console.log(
      `  rows needing EN      ${r.rows_needing_en}   (clean: ${r.rows_clean}, skipped by kind: ${r.rows_skipped_by_kind})`
    );
    console.log(`  slots needing EN     ${r.slots_needing_en}`);
    console.log(`    mirrored bags      ${r.mirrored_bags}`);
    console.log(`    plain PT strings   ${r.plain_pt_strings}`);
    console.log(`  covered by map       ${r.covered_by_map}   (uncovered: ${r.uncovered})`);
  }
  const t = report.total as Record<string, number>;
  console.log(
    `\nTOTAL  rows needing EN ${t.rows_needing_en}/${t.rows} · slots ${t.slots_needing_en} · uncovered ${t.uncovered}`
  );
}

/** Dump every still-untranslated PT string in the batch format translators consume. */
function cmdExtract(): void {
  const map = loadMap();
  const acc = new Map<string, { key: string; pt: string; paths: Set<string>; kinds: Set<string>; n: number }>();
  for (const src of SOURCES) {
    for (const row of queryJson<Row>(src.select)) {
      if (DENY_KINDS.has(row.kind)) continue;
      for (const s of untranslatedSlots(docOf(row, src.hasTitle) as Json)) {
        if (map[keyOf(s.pt)]) continue;
        const e = acc.get(s.pt) ?? { key: keyOf(s.pt), pt: s.pt, paths: new Set(), kinds: new Set(), n: 0 };
        e.paths.add(normPath(s.path));
        e.kinds.add(row.kind);
        e.n++;
        acc.set(s.pt, e);
      }
    }
  }
  const out = [...acc.values()].map((e) => ({
    key: e.key,
    pt: e.pt,
    paths: [...e.paths].sort(),
    kinds: [...e.kinds].sort(),
    n: e.n,
  }));
  console.log(JSON.stringify(out, null, 1));
  console.error(`extract: ${out.length} unique strings still need a translation`);
}

function cmdApply(dryRun: boolean, limit: number | null): void {
  const map = loadMap();
  if (Object.keys(map).length === 0) throw new Error(`No translations found at ${TRANSLATIONS_PATH}`);

  const batchId = randomUUID();
  const statements: string[] = [];
  let touched = 0;
  let filledTotal = 0;

  for (const src of SOURCES) {
    for (const row of queryJson<Row>(src.select)) {
      if (limit !== null && touched >= limit) break;
      if (DENY_KINDS.has(row.kind)) continue;
      const stats = { filled: 0 };
      const spec = fillEnglish(row.spec, map, '.spec', stats);
      const rubric = fillEnglish(row.rubric, map, '.rubric', stats);
      const title = src.hasTitle
        ? fillEnglish(row.title_i18n ?? {}, map, '.title_i18n', stats)
        : undefined;
      if (stats.filled === 0) continue;

      touched++;
      filledTotal += stats.filled;
      if (dryRun) continue;

      const titleCol = src.hasTitle ? `, title_i18n` : '';
      const titleVal = src.hasTitle ? `, ${dollar(JSON.stringify(row.title_i18n ?? {}))}::jsonb` : '';
      statements.push(
        `INSERT INTO itera.activity_i18n_backup (batch_id, source_table, row_id, spec, rubric${titleCol})
         VALUES ('${batchId}', '${src.table}', '${row.id}', ${dollar(JSON.stringify(row.spec))}::jsonb, ${dollar(JSON.stringify(row.rubric))}::jsonb${titleVal})
         ON CONFLICT (batch_id, source_table, row_id) DO NOTHING;`
      );
      const sets = [
        `spec = ${dollar(JSON.stringify(spec))}::jsonb`,
        `rubric = ${dollar(JSON.stringify(rubric))}::jsonb`,
        ...(src.hasTitle ? [`title_i18n = ${dollar(JSON.stringify(title))}::jsonb`] : []),
      ];
      statements.push(`UPDATE itera.${src.table} SET ${sets.join(', ')} WHERE id = '${row.id}';`);
    }
  }

  console.log(`rows to touch: ${touched}, EN values filled: ${filledTotal}`);
  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }
  if (!statements.length) {
    console.log('nothing to do.');
    return;
  }

  // One transaction: the backup and the rewrite land together or not at all.
  const sqlFile = join(HERE, `.apply-${batchId}.sql`);
  writeFileSync(sqlFile, `BEGIN;\n${statements.join('\n')}\nCOMMIT;\n`, 'utf-8');
  try {
    psql(sqlFile, { file: true });
  } finally {
    try {
      writeFileSync(sqlFile, '', 'utf-8');
      // Best-effort scrub; the file holds authored content, not credentials.
      spawnSync('rm', ['-f', sqlFile]);
    } catch {
      /* ignore */
    }
  }
  console.log(`APPLIED batch_id=${batchId}`);
  console.log(`revert with: npx tsx scripts/i18n/activity-i18n.ts revert --batch ${batchId}`);
}

function cmdRevert(batch: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(batch)) throw new Error('--batch must be a uuid');
  const sql = `
BEGIN;
UPDATE itera.activities a
   SET spec = b.spec, rubric = b.rubric
  FROM itera.activity_i18n_backup b
 WHERE b.batch_id = '${batch}' AND b.source_table = 'activities' AND b.row_id = a.id;
UPDATE itera.activity_defs d
   SET spec = b.spec, rubric = b.rubric, title_i18n = coalesce(b.title_i18n, d.title_i18n)
  FROM itera.activity_i18n_backup b
 WHERE b.batch_id = '${batch}' AND b.source_table = 'activity_defs' AND b.row_id = d.id;
COMMIT;`;
  const file = join(HERE, `.revert-${batch}.sql`);
  writeFileSync(file, sql, 'utf-8');
  try {
    psql(file, { file: true });
  } finally {
    spawnSync('rm', ['-f', file]);
  }
  const n = psql(
    `SELECT count(*) FROM itera.activity_i18n_backup WHERE batch_id = '${batch}'`
  );
  console.log(`REVERTED batch_id=${batch} (${n} rows restored)`);
}

// ---------------------------------------------------------------------------

function main(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const has = (f: string) => argv.includes(f);
  const val = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  switch (cmd) {
    case 'audit':
      return cmdAudit(has('--json'));
    case 'extract':
      return cmdExtract();
    case 'apply': {
      const lim = val('--limit');
      return cmdApply(has('--dry-run'), lim ? Number(lim) : null);
    }
    case 'revert': {
      const b = val('--batch');
      if (!b) throw new Error('revert requires --batch <uuid>');
      return cmdRevert(b);
    }
    default:
      console.error(
        'usage: activity-i18n.ts <audit [--json] | extract | apply [--dry-run] [--limit N] | revert --batch <uuid>>'
      );
      process.exit(2);
  }
}

main();
