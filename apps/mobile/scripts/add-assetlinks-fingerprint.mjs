#!/usr/bin/env node
/**
 * Adds one SHA-256 signing-certificate fingerprint to public/.well-known/assetlinks.json (R-5).
 *
 * The file lists the EAS upload key (signs the preview APK). A build distributed by Google Play is
 * re-signed with Play's app-signing key, so that second fingerprint joins the list the day the Play
 * Console app exists (Play Console -> Test and release -> App integrity -> App signing -> "SHA-256
 * certificate fingerprint"). Run from the repo root:
 *
 *   node apps/mobile/scripts/add-assetlinks-fingerprint.mjs <SHA-256>
 *   node apps/mobile/scripts/add-assetlinks-fingerprint.mjs --check
 *
 * The fingerprint is 32 colon-separated hex pairs in any case, or 64 hex characters. It is stored in
 * upper-case colon form, appended after the existing ones. Nothing is ever removed. A duplicate is
 * "already present" (exit 0, file untouched). A file of an unexpected shape is refused and not rewritten.
 *
 * Exit codes: 0 done / already present / --check; 1 refused (bad fingerprint or unexpected file).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PACKAGE_NAME = 'com.tainanfidelis.iterahq';
export const RELATION = 'delegate_permission/common.handle_all_urls';
export const ASSETLINKS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/.well-known/assetlinks.json');

const COLON_FORM = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** Pure: any accepted spelling -> upper-case colon form. Throws an Error with a clear message otherwise. */
export function normalizeFingerprint(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw === '') throw new Error('no fingerprint given: expected a SHA-256 as 32 colon-separated hex pairs or 64 hex characters');
  let hex;
  if (raw.includes(':')) {
    if (!/^([0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2}$/.test(raw)) {
      throw new Error('not a SHA-256 fingerprint: with colons it must be exactly 32 hex pairs (AA:BB:...), 95 characters');
    }
    hex = raw.replaceAll(':', '');
  } else {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error(`not a SHA-256 fingerprint: without colons it must be exactly 64 hex characters (0-9, A-F), got ${raw.length} characters`);
    }
    hex = raw;
  }
  return hex.toUpperCase().match(/../g).join(':');
}

/** Pure: the statement of the package, or an Error when the file is not the shape we know how to edit. */
function locate(body) {
  if (!Array.isArray(body)) throw new Error('assetlinks.json is not a JSON array');
  const mine = body.filter((s) => s?.target?.package_name === PACKAGE_NAME);
  if (mine.length !== 1) throw new Error(`assetlinks.json must hold exactly one statement for ${PACKAGE_NAME}, found ${mine.length}`);
  const st = mine[0];
  if (!Array.isArray(st.relation) || st.relation.length !== 1 || st.relation[0] !== RELATION) throw new Error(`the statement for ${PACKAGE_NAME} must have the single relation ${RELATION}`);
  const list = st.target.sha256_cert_fingerprints;
  if (st.target.namespace !== 'android_app') throw new Error('the statement namespace must be android_app');
  if (!Array.isArray(list) || list.length < 1 || !list.every((f) => typeof f === 'string' && COLON_FORM.test(f))) {
    throw new Error('sha256_cert_fingerprints must be a non-empty list of upper-case colon-form fingerprints');
  }
  if (new Set(list).size !== list.length) throw new Error('sha256_cert_fingerprints already has a duplicate');
  return st;
}

/** Pure: the fingerprints the file lists now. */
export function listFingerprints(text) {
  return [...locate(parse(text)).target.sha256_cert_fingerprints];
}

function parse(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw new Error(`assetlinks.json is not valid JSON: ${e.message}`);
  }
  return body;
}

const serialize = (body) => `${JSON.stringify(body, null, 2)}\n`;

/**
 * Pure: the new file text. `{ status: 'added', text, fingerprints }` or `{ status: 'present', text, fingerprints }`
 * (text unchanged). Refuses a file whose formatting is not the one we write back, so a rewrite never reformats it.
 */
export function addFingerprint(text, input) {
  const fp = normalizeFingerprint(input);
  const body = parse(text);
  const st = locate(body);
  if (serialize(body) !== text) throw new Error('assetlinks.json is not formatted as JSON with 2 spaces and a final newline; refusing to rewrite it');
  const list = st.target.sha256_cert_fingerprints;
  if (list.includes(fp)) return { status: 'present', text, fingerprints: [...list], fingerprint: fp };
  list.push(fp);
  return { status: 'added', text: serialize(body), fingerprints: [...list], fingerprint: fp };
}

function main(argv) {
  const args = argv.slice(2);
  const fail = (msg) => {
    console.error(`add-assetlinks-fingerprint: ${msg}`);
    process.exit(1);
  };
  const file = process.env.ASSETLINKS_FILE || ASSETLINKS_FILE;
  if (args.length !== 1) fail('usage: node apps/mobile/scripts/add-assetlinks-fingerprint.mjs <SHA-256> | --check');
  const text = readFileSync(file, 'utf8');
  try {
    if (args[0] === '--check') {
      const list = listFingerprints(text);
      console.log(`${PACKAGE_NAME}: ${list.length} fingerprint(s)`);
      for (const f of list) console.log(`  ${f}`);
      return;
    }
    const r = addFingerprint(text, args[0]);
    if (r.status === 'present') {
      console.log(`already present: ${r.fingerprint} (file untouched, ${r.fingerprints.length} fingerprint(s))`);
      return;
    }
    writeFileSync(file, r.text);
    console.log(`added: ${r.fingerprint}`);
    console.log(`${PACKAGE_NAME} now lists ${r.fingerprints.length} fingerprint(s):`);
    for (const f of r.fingerprints) console.log(`  ${f}`);
    console.log('Next: open a PR; after the deploy, check the Digital Asset Links API (docs/mobile-shell.md, R-5).');
  } catch (e) {
    fail(e.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
