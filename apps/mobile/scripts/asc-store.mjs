#!/usr/bin/env node
/**
 * App Store Connect CLI of the Itera iOS shell: read the state of the listing, push `store/metadata.json`
 * and `store/screenshots/**` into it, submit it for review. Zero dependencies (Node 20, `node:crypto`),
 * run by `.github/workflows/mobile-store-asc.yml`: the API key exists only as repo secrets.
 *
 *   node scripts/asc-store.mjs status [--version 0.3.0]
 *   node scripts/asc-store.mjs push --version 0.3.0 [--build-number 4] [--dry-run]
 *   node scripts/asc-store.mjs submit --version 0.3.0 --confirm com.tainanfidelis.iterahq
 *
 * Env: ASC_API_KEY_PATH (the .p8), ASC_API_KEY_ID, ASC_API_ISSUER_ID. Optional, for `push`:
 * ASC_REVIEW_CONTACT_FIRST_NAME / _LAST_NAME / _EMAIL / _PHONE and ASC_REVIEW_DEMO_USER / _PASSWORD; a
 * missing one skips its field with a warning. The token, the key and the demo credentials are never printed.
 *
 * Exit codes: 0 done; 1 the API refused; 2 bad input or the checklist still blocks (submit).
 * Pure logic (JWT, validation, payloads, checklist) is exported and tested in asc-store.test.mjs.
 */
import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { appendFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pngInfo, EXPECTED, DISPLAY_TYPE } from './store-screenshots.mjs';

export const API = 'https://api.appstoreconnect.apple.com/v1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_METADATA = path.join(HERE, '..', 'store', 'metadata.json');
export const DEFAULT_SCREENSHOTS = path.join(HERE, '..', 'store', 'screenshots');

/** Version states in which the listing and the build can still be edited. */
export const EDITABLE_STATES = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];

export const LIMITS = { name: 30, subtitle: 30, promotionalText: 170, description: 4000, keywords: 100 };

/** Apple 3.1.1 and the repo's W-7: the listing never names a price, a subscription or a purchase. */
export const FORBIDDEN_BILLING =
  /\b(pre[cç]os?|prices?|pricing|assin\w*|subscri\w*|pagamentos?|payments?|checkout|compre|comprar|buy|purchas\w*|gr[aá]tis|free|trial|premium|stripe|mensalidade|r\$)\b|\$\s?\d/i;

// ------------------------------------------------------------------ JWT

export function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** Pure given a signer: `sign(data: string) => Buffer` of the raw (r||s) ES256 signature. 15 minutes of life. */
export function buildJwt({ keyId, issuerId, now = Date.now(), sign, lifetimeSeconds = 15 * 60 }) {
  if (!keyId || !issuerId) throw new Error('ASC_API_KEY_ID and ASC_API_ISSUER_ID are required');
  const iat = Math.floor(now / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const claims = { iss: issuerId, iat, exp: iat + lifetimeSeconds, aud: 'appstoreconnect-v1' };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  return `${data}.${base64url(sign(data))}`;
}

export function es256Signer(pem) {
  const key = createPrivateKey(pem);
  return (data) => cryptoSign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
}

// ------------------------------------------------------------------ validation

/**
 * Pure: every problem of the metadata file, as strings. Empty means valid. The billing words are scanned in the
 * public listing only: the review notes may say "no price, no purchase" to the reviewer.
 */
export function validateMetadata(meta) {
  const errors = [];
  for (const k of ['bundleId', 'ascAppId', 'primaryCategory', 'copyright', 'supportUrl', 'marketingUrl', 'privacyPolicyUrl']) {
    if (typeof meta?.[k] !== 'string' || !meta[k]) errors.push(`${k} is missing`);
  }
  for (const k of ['supportUrl', 'marketingUrl', 'privacyPolicyUrl']) {
    if (typeof meta?.[k] === 'string' && meta[k] && !/^https:\/\/[^\s]+$/.test(meta[k])) errors.push(`${k} must be an https URL`);
  }
  if (!meta?.ageRating || typeof meta.ageRating !== 'object') errors.push('ageRating is missing');
  if (typeof meta?.review?.notes !== 'string' || !meta.review.notes.trim()) errors.push('review.notes is missing');
  const locales = meta?.locales && typeof meta.locales === 'object' ? Object.entries(meta.locales) : [];
  if (locales.length === 0) errors.push('locales is empty');
  const texts = [];
  for (const [locale, fields] of locales) {
    for (const [field, limit] of Object.entries(LIMITS)) {
      const value = fields?.[field];
      if (typeof value !== 'string' || !value.trim()) errors.push(`${locale}.${field} is missing`);
      else {
        if ([...value].length > limit) errors.push(`${locale}.${field} is ${[...value].length} characters, the limit is ${limit}`);
        texts.push([`${locale}.${field}`, value]);
      }
    }
  }
  for (const [where, value] of texts) {
    const hit = FORBIDDEN_BILLING.exec(value);
    if (hit) errors.push(`${where} names billing ("${hit[0]}"): Apple 3.1.1 and W-7 forbid it in the shell's listing`);
  }
  return errors;
}

/** Reads the PNGs of one locale/display type folder and returns [{file, name, size, info}] sorted by name. Throws on a bad file. */
export function readScreenshots(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{2}-[a-z0-9-]+\.png$/.test(f))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      const data = readFileSync(file);
      const info = pngInfo(data);
      if (info.width !== EXPECTED.width || info.height !== EXPECTED.height) throw new Error(`${name}: ${info.width}x${info.height}, expected ${EXPECTED.width}x${EXPECTED.height}`);
      if (info.hasAlpha) throw new Error(`${name}: has an alpha channel`);
      return { file, name, size: data.length, md5: createHash('md5').update(data).digest('hex'), data };
    });
}

// ------------------------------------------------------------------ payload builders

const rel = (type, id) => ({ data: { type, id } });

export const versionCreatePayload = (appId, versionString) => ({
  data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString }, relationships: { app: rel('apps', appId) } },
});

export const appInfoLocalizationAttrs = (meta, locale) => {
  const l = meta.locales[locale];
  return { name: l.name, subtitle: l.subtitle, privacyPolicyUrl: meta.privacyPolicyUrl };
};

export const versionLocalizationAttrs = (meta, locale) => {
  const l = meta.locales[locale];
  return { description: l.description, keywords: l.keywords, promotionalText: l.promotionalText, supportUrl: meta.supportUrl, marketingUrl: meta.marketingUrl };
};

/** Create or update: `existingId` null creates and needs the parent relationship. */
export function upsertPayload(type, existingId, attributes, parent) {
  if (existingId) return { data: { type, id: existingId, attributes } };
  return { data: { type, attributes, relationships: { [parent.name]: rel(parent.type, parent.id) } } };
}

export const ageRatingPayload = (id, ageRating) => ({ data: { type: 'ageRatingDeclarations', id, attributes: { ...ageRating } } });

/** Pure: review detail attributes from the file and the env. `warnings` lists what was skipped; values are never echoed. */
export function reviewDetailAttrs(meta, env) {
  const attrs = { notes: meta.review.notes };
  const warnings = [];
  const contact = [
    ['contactFirstName', 'ASC_REVIEW_CONTACT_FIRST_NAME'],
    ['contactLastName', 'ASC_REVIEW_CONTACT_LAST_NAME'],
    ['contactEmail', 'ASC_REVIEW_CONTACT_EMAIL'],
    ['contactPhone', 'ASC_REVIEW_CONTACT_PHONE'],
  ];
  for (const [attr, name] of contact) {
    if (env[name]) attrs[attr] = env[name];
    else warnings.push(`${name} is not set: ${attr} skipped`);
  }
  if (env.ASC_REVIEW_DEMO_USER && env.ASC_REVIEW_DEMO_PASSWORD) {
    attrs.demoAccountRequired = true;
    attrs.demoAccountName = env.ASC_REVIEW_DEMO_USER;
    attrs.demoAccountPassword = env.ASC_REVIEW_DEMO_PASSWORD;
  } else {
    warnings.push('ASC_REVIEW_DEMO_USER / ASC_REVIEW_DEMO_PASSWORD are not set: the demo account skipped');
  }
  return { attrs, warnings };
}

export const screenshotReservePayload = (setId, fileName, fileSize) => ({
  data: { type: 'appScreenshots', attributes: { fileName, fileSize }, relationships: { appScreenshotSet: rel('appScreenshotSets', setId) } },
});
export const screenshotCommitPayload = (id, md5) => ({ data: { type: 'appScreenshots', id, attributes: { uploaded: true, sourceFileChecksum: md5 } } });

export const reviewSubmissionPayload = (appId) => ({ data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: rel('apps', appId) } } });
export const reviewItemPayload = (submissionId, versionId) => ({
  data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: rel('reviewSubmissions', submissionId), appStoreVersion: rel('appStoreVersions', versionId) } },
});

// ------------------------------------------------------------------ checklist

/**
 * Pure: what the API can prove still blocks a submission of the target version, as strings. `state` is the
 * object `gather` returns. Things only the web UI shows (App Privacy label) are in `MANUAL_STEPS`, not here.
 */
export function blockingChecklist(state, meta) {
  const out = [];
  const t = state.target;
  if (!t) {
    out.push('no editable App Store version for the requested version string (run push to create it)');
  } else if (!EDITABLE_STATES.includes(t.state)) {
    out.push(`version ${t.versionString} is "${t.state}", not editable`);
  }
  if (!state.builds.some((b) => b.processingState === 'VALID')) out.push('no build finished processing (VALID)');
  if (t && !t.build) out.push('no build is attached to the version');
  if (t && !t.copyright) out.push('copyright is empty');
  if (!state.appInfo?.primaryCategory) out.push('primary category is not set');
  const required = { name: 'info', subtitle: 'info', privacyPolicyUrl: 'info', description: 'version', keywords: 'version', supportUrl: 'version' };
  for (const locale of Object.keys(meta.locales)) {
    const info = state.appInfo?.localizations.find((l) => l.locale === locale);
    const ver = t?.localizations.find((l) => l.locale === locale);
    if (!info) out.push(`${locale}: no app info localization`);
    if (t && !ver) out.push(`${locale}: no version localization`);
    for (const [field, where] of Object.entries(required)) {
      const src = where === 'info' ? info?.attrs : ver?.attrs;
      if ((where === 'info' ? info : ver) && !src?.[field]) out.push(`${locale}: ${field} is empty`);
    }
    const count = ver?.screenshots?.[DISPLAY_TYPE] ?? 0;
    if (t && count < 1) out.push(`${locale}: no ${DISPLAY_TYPE} screenshot`);
  }
  const ar = state.ageRating;
  if (!ar) out.push('age rating declaration not found');
  else {
    // The declaration also carries optional attributes (overrides, kids age band) that stay null on a complete answer.
    const open = Object.keys(meta.ageRating ?? {}).filter((k) => ar[k] === null || ar[k] === undefined);
    if (open.length) out.push(`age rating declaration has unanswered questions: ${open.join(', ')}`);
  }
  const rd = t?.reviewDetail;
  if (t && !rd) out.push('review detail is missing');
  else if (rd) {
    for (const f of ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone']) if (!rd[f]) out.push(`review detail: ${f} is empty`);
    if (!rd.demoAccountRequired) out.push('review detail: demo account is not set (the app needs a signed-in account)');
    else if (!rd.hasDemoAccountName || !rd.hasDemoAccountPassword) out.push('review detail: demo account name or password is empty');
    if (!rd.notes) out.push('review detail: notes are empty');
  }
  if (!state.hasPriceSchedule) out.push('price schedule is not set (a free app still needs the free price point)');
  return out;
}

export const MANUAL_STEPS = [
  'App Privacy label: published in the App Store Connect UI (no API). Tick exactly the data types of app.json privacyManifests.',
  'Content rights, availability and pricing (free) confirmed in the UI.',
  'Privacy policy page exists at the URL of the listing (the shell cannot check the page text).',
  'Sign in with Apple (4.8) risk read in apps/mobile/APP_REVIEW.md and accepted by the owner.',
];

// ------------------------------------------------------------------ HTTP client

export class AscError extends Error {
  constructor(status, method, pathname, errors) {
    const detail = (errors ?? []).map((e) => `${e.code ?? ''} ${e.title ?? ''}: ${e.detail ?? ''}`.trim()).join(' | ');
    super(`${method} ${pathname} -> ${status}${detail ? ` (${detail})` : ''}`);
    this.status = status;
  }
}

/** `fetchImpl` and `tokenFn` are injected; the token is only ever put in the Authorization header. */
export class AscClient {
  constructor({ fetchImpl = fetch, tokenFn, base = API }) {
    this.fetchImpl = fetchImpl;
    this.tokenFn = tokenFn;
    this.base = base;
  }

  async request(method, pathname, { params, body, allow404 = false } = {}) {
    const url = new URL(`${this.base}${pathname}`);
    if (!pathname.startsWith('/') || url.origin !== new URL(this.base).origin) throw new Error(`asc-store: refused a request outside ${this.base}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const res = await this.fetchImpl(url.toString(), {
      method,
      headers: { Authorization: `Bearer ${this.tokenFn()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (res.status === 404 && allow404) return null;
    if (!res.ok) throw new AscError(res.status, method, url.pathname, json?.errors);
    return json;
  }

  get(pathname, opts) {
    return this.request('GET', pathname, opts);
  }
}

const isPlaceholder = (id) => typeof id === 'string' && id.startsWith('(new ');

// ------------------------------------------------------------------ gather (read only)

/** Reads everything `status`, `push` and `submit` need. Only GETs. `versionString` picks the target version. */
export async function gather(client, meta, versionString) {
  const appId = meta.ascAppId;
  const app = (await client.get(`/apps/${appId}`)).data;
  const state = { app: { id: app.id, name: app.attributes.name, bundleId: app.attributes.bundleId } };

  const versions = (await client.get(`/apps/${appId}/appStoreVersions`, { params: { 'filter[platform]': 'IOS', limit: '50' } })).data;
  state.versions = versions.map((v) => ({ id: v.id, versionString: v.attributes.versionString, state: v.attributes.appStoreState ?? v.attributes.appVersionState, copyright: v.attributes.copyright }));

  const builds = await client.get('/builds', { params: { 'filter[app]': appId, sort: '-uploadedDate', limit: '20', include: 'preReleaseVersion' } });
  const preById = new Map((builds.included ?? []).filter((i) => i.type === 'preReleaseVersions').map((i) => [i.id, i.attributes.version]));
  state.builds = builds.data.map((b) => ({
    id: b.id,
    version: b.attributes.version,
    preVersion: preById.get(b.relationships?.preReleaseVersion?.data?.id) ?? null,
    processingState: b.attributes.processingState,
    uploadedDate: b.attributes.uploadedDate,
  }));

  const infos = (await client.get(`/apps/${appId}/appInfos`)).data;
  const info = infos.find((i) => EDITABLE_STATES.includes(i.attributes.appStoreState ?? i.attributes.state)) ?? infos[0];
  if (info) {
    const [locs, cat, age] = await Promise.all([
      client.get(`/appInfos/${info.id}/appInfoLocalizations`, { params: { limit: '50' } }),
      client.get(`/appInfos/${info.id}/primaryCategory`, { allow404: true }),
      client.get(`/appInfos/${info.id}/ageRatingDeclaration`, { allow404: true }),
    ]);
    state.appInfo = {
      id: info.id,
      state: info.attributes.appStoreState ?? info.attributes.state,
      primaryCategory: cat?.data?.id ?? null,
      localizations: locs.data.map((l) => ({ id: l.id, locale: l.attributes.locale, attrs: l.attributes })),
    };
    state.ageRating = age?.data ? { id: age.data.id, ...age.data.attributes } : null;
  } else {
    state.appInfo = null;
    state.ageRating = null;
  }

  const price = await client.get(`/apps/${appId}/appPriceSchedule`, { allow404: true }).catch(() => null);
  state.hasPriceSchedule = Boolean(price?.data);

  const wanted = versionString ? state.versions.find((v) => v.versionString === versionString) : state.versions.find((v) => EDITABLE_STATES.includes(v.state));
  state.target = wanted ? await gatherVersion(client, wanted) : null;
  return state;
}

async function gatherVersion(client, v) {
  const [locs, buildRes, review] = await Promise.all([
    client.get(`/appStoreVersions/${v.id}/appStoreVersionLocalizations`, { params: { limit: '50' } }),
    client.get(`/appStoreVersions/${v.id}/build`, { allow404: true }),
    client.get(`/appStoreVersions/${v.id}/appStoreReviewDetail`, { allow404: true }),
  ]);
  const localizations = [];
  for (const l of locs.data) {
    const sets = await client.get(`/appStoreVersionLocalizations/${l.id}/appScreenshotSets`, { params: { include: 'appScreenshots', limit: '50' } });
    const screenshots = {};
    const setIds = {};
    for (const s of sets.data) {
      screenshots[s.attributes.screenshotDisplayType] = (s.relationships?.appScreenshots?.data ?? []).length;
      setIds[s.attributes.screenshotDisplayType] = { id: s.id, screenshotIds: (s.relationships?.appScreenshots?.data ?? []).map((x) => x.id) };
    }
    localizations.push({ id: l.id, locale: l.attributes.locale, attrs: l.attributes, screenshots, setIds });
  }
  const r = review?.data?.attributes;
  return {
    ...v,
    localizations,
    build: buildRes?.data ? { id: buildRes.data.id, version: buildRes.data.attributes.version } : null,
    // Credentials are reduced to booleans here so nothing downstream can print them.
    reviewDetail: r
      ? { id: review.data.id, contactFirstName: r.contactFirstName, contactLastName: r.contactLastName, contactEmail: r.contactEmail, contactPhone: r.contactPhone, demoAccountRequired: r.demoAccountRequired, hasDemoAccountName: Boolean(r.demoAccountName), hasDemoAccountPassword: Boolean(r.demoAccountPassword), notes: r.notes }
      : null,
  };
}

// ------------------------------------------------------------------ status

export function renderStatus(state, meta, blocking) {
  const L = [];
  L.push(`### App Store Connect: ${state.app.name} (${state.app.bundleId})`, '');
  L.push('| version | state |', '|---|---|');
  for (const v of state.versions) L.push(`| ${v.versionString} | ${v.state} |`);
  if (state.versions.length === 0) L.push('| none | |');
  L.push('', '| build | pre-release version | processing |', '|---|---|---|');
  for (const b of state.builds) L.push(`| ${b.version} | ${b.preVersion ?? '?'} | ${b.processingState} |`);
  if (state.builds.length === 0) L.push('| none | | |');
  L.push('', `Primary category: ${state.appInfo?.primaryCategory ?? 'not set'}. Price schedule: ${state.hasPriceSchedule ? 'present' : 'missing'}. Age rating: ${state.ageRating ? 'present' : 'missing'}.`);
  const t = state.target;
  L.push(`Target version: ${t ? `${t.versionString} (${t.state}), build ${t.build?.version ?? 'none attached'}` : 'none'}. Review detail: ${t?.reviewDetail ? 'present' : 'missing'}.`, '');
  L.push('| locale | name | subtitle | privacy URL | description | keywords | support URL | promo | screenshots |', '|---|---|---|---|---|---|---|---|---|');
  for (const locale of Object.keys(meta.locales)) {
    const info = state.appInfo?.localizations.find((l) => l.locale === locale)?.attrs;
    const ver = t?.localizations.find((l) => l.locale === locale);
    const mark = (v) => (v ? 'filled' : 'MISSING');
    const shots = Object.entries(ver?.screenshots ?? {}).map(([k, n]) => `${k}: ${n}`).join(', ') || 'none';
    L.push(`| ${locale} | ${mark(info?.name)} | ${mark(info?.subtitle)} | ${mark(info?.privacyPolicyUrl)} | ${mark(ver?.attrs.description)} | ${mark(ver?.attrs.keywords)} | ${mark(ver?.attrs.supportUrl)} | ${mark(ver?.attrs.promotionalText)} | ${shots} |`);
  }
  L.push('', blocking.length ? '**Blocking submission:**' : '**Nothing the API can see blocks a submission.**');
  for (const b of blocking) L.push(`- ${b}`);
  L.push('', 'Manual, not checkable here:');
  for (const m of MANUAL_STEPS) L.push(`- ${m}`);
  return L.join('\n') + '\n';
}

function emit(text, env) {
  process.stdout.write(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
}

export async function runStatus({ client, meta, version, env = process.env }) {
  const state = await gather(client, meta, version);
  const blocking = blockingChecklist(state, meta);
  emit(renderStatus(state, meta, blocking), env);
  return { state, blocking };
}

// ------------------------------------------------------------------ push

/**
 * Idempotent: ensures the editable version, then upserts every field of the file. With `dryRun` it sends
 * GETs only and returns the list of writes it would make. `fetchImpl` carries the asset-upload PUTs too.
 */
export async function runPush({ client, meta, version, buildNumber, dryRun = false, env = process.env, screenshotsDir = DEFAULT_SCREENSHOTS, log = console.log }) {
  const errors = validateMetadata(meta);
  if (errors.length) throw new InputError(`metadata is invalid:\n- ${errors.join('\n- ')}`);
  if (!version) throw new InputError('--version is required for push');
  const shots = {};
  for (const locale of Object.keys(meta.locales)) {
    const found = readScreenshots(path.join(screenshotsDir, locale, DISPLAY_TYPE));
    if (found.length === 0) log(`warning: no ${DISPLAY_TYPE} screenshots on disk for ${locale}: its screenshots are left as they are`);
    shots[locale] = found;
  }
  const review = reviewDetailAttrs(meta, env);
  for (const w of review.warnings) log(`warning: ${w}`);

  const plan = [];
  let seq = 0;
  const write = async (method, pathname, body, type) => {
    plan.push(`${method} ${pathname}${body?.data?.attributes ? ` [${Object.keys(body.data.attributes).join(', ')}]` : ''}`);
    if (dryRun) return { data: { id: `(new ${type ?? 'resource'} ${(seq += 1)})` } };
    return client.request(method, pathname, { body });
  };

  let state = await gather(client, meta, version);
  let target = state.target;
  if (target && !EDITABLE_STATES.includes(target.state)) throw new InputError(`version ${version} is "${target.state}" and cannot be edited`);
  let versionId = target?.id;
  const draft = versionId ? null : state.versions.find((v) => EDITABLE_STATES.includes(v.state));
  if (draft) {
    if (draft.state !== 'PREPARE_FOR_SUBMISSION') {
      throw new InputError(`another version is editable (${draft.versionString}, "${draft.state}"); push it or remove it before creating ${version}`);
    }
    // App Store Connect holds one editable version. A draft that was never submitted takes the requested string.
    await write('PATCH', `/appStoreVersions/${draft.id}`, { data: { type: 'appStoreVersions', id: draft.id, attributes: { versionString: version } } });
    state = await gather(client, meta, dryRun ? draft.versionString : version);
    target = state.target;
    versionId = target.id;
  } else if (!versionId) {
    versionId = (await write('POST', '/appStoreVersions', versionCreatePayload(meta.ascAppId, version), 'appStoreVersion')).data.id;
    target = { id: versionId, localizations: [], reviewDetail: null };
    // A new version copies the localizations of the last one and turns the appInfo editable: read both again.
    if (!dryRun) {
      state = await gather(client, meta, version);
      target = state.target;
    }
  }
  await write('PATCH', `/appStoreVersions/${versionId}`, { data: { type: 'appStoreVersions', id: versionId, attributes: { copyright: meta.copyright } } });

  const infoId = state.appInfo?.id;
  if (!infoId) throw new InputError('the app has no appInfo');
  await write('PATCH', `/appInfos/${infoId}`, { data: { type: 'appInfos', id: infoId, relationships: { primaryCategory: rel('appCategories', meta.primaryCategory) } } });

  for (const locale of Object.keys(meta.locales)) {
    const info = state.appInfo.localizations.find((l) => l.locale === locale);
    const infoPayload = upsertPayload('appInfoLocalizations', info?.id, appInfoLocalizationAttrs(meta, locale), { name: 'appInfo', type: 'appInfos', id: infoId });
    if (!info) infoPayload.data.attributes.locale = locale;
    try {
      await write(info ? 'PATCH' : 'POST', info ? `/appInfoLocalizations/${info.id}` : '/appInfoLocalizations', infoPayload, 'appInfoLocalization');
    } catch (e) {
      // An app name is unique per storefront language. A taken name keeps the one the record has; the rest is still written.
      if (!(e instanceof AscError) || e.status !== 409 || !/DUPLICATE\.DIFFERENT_ACCOUNT/.test(e.message) || !info?.attrs?.name) throw e;
      log(`warning: ${locale}: the name "${infoPayload.data.attributes.name}" is taken on the App Store; kept "${info.attrs.name}"`);
      delete infoPayload.data.attributes.name;
      await write('PATCH', `/appInfoLocalizations/${info.id}`, infoPayload, 'appInfoLocalization');
    }

    let ver = target.localizations.find((l) => l.locale === locale);
    // A new appInfo localization makes App Store Connect create the version localization of that locale.
    if (!ver && !info && !dryRun) {
      const again = await client.get(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`, { params: { limit: '50' } });
      const made = again.data.find((l) => l.attributes.locale === locale);
      if (made) ver = { id: made.id, locale };
    }
    const verPayload = upsertPayload('appStoreVersionLocalizations', ver?.id, versionLocalizationAttrs(meta, locale), { name: 'appStoreVersion', type: 'appStoreVersions', id: versionId });
    if (!ver) verPayload.data.attributes.locale = locale;
    const saved = await write(ver ? 'PATCH' : 'POST', ver ? `/appStoreVersionLocalizations/${ver.id}` : '/appStoreVersionLocalizations', verPayload, 'appStoreVersionLocalization');
    const locId = ver?.id ?? saved.data.id;

    if (shots[locale].length) await replaceScreenshots({ client, write, dryRun, locId, existing: ver?.setIds?.[DISPLAY_TYPE], files: shots[locale] });
  }

  if (state.ageRating?.id) await write('PATCH', `/ageRatingDeclarations/${state.ageRating.id}`, ageRatingPayload(state.ageRating.id, meta.ageRating));
  else log('warning: no age rating declaration found; it is not created by this script');

  if (buildNumber) {
    const build = state.builds.find((b) => b.version === String(buildNumber) && (!b.preVersion || b.preVersion === version));
    if (!build) throw new InputError(`no build ${buildNumber} of version ${version} found`);
    if (build.processingState !== 'VALID') throw new InputError(`build ${buildNumber} is "${build.processingState}", not VALID`);
    await write('PATCH', `/appStoreVersions/${versionId}/relationships/build`, { data: { type: 'builds', id: build.id } });
  }

  // Last on purpose: App Store Connect refuses a review detail without a contact, and that must not hold back the build.
  const rd = target.reviewDetail;
  const rdPayload = upsertPayload('appStoreReviewDetails', rd?.id, review.attrs, { name: 'appStoreVersion', type: 'appStoreVersions', id: versionId });
  await write(rd ? 'PATCH' : 'POST', rd ? `/appStoreReviewDetails/${rd.id}` : '/appStoreReviewDetails', rdPayload, 'appStoreReviewDetail');

  log(`${dryRun ? 'dry run, planned' : 'done,'} ${plan.length} write call(s):`);
  for (const p of plan) log(`  ${p}`);
  return { plan };
}

async function replaceScreenshots({ client, write, dryRun, locId, existing, files }) {
  let setId = existing?.id;
  if (!setId) {
    const body = { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: DISPLAY_TYPE }, relationships: { appStoreVersionLocalization: rel('appStoreVersionLocalizations', locId) } } };
    setId = (await write('POST', '/appScreenshotSets', body, 'appScreenshotSet')).data.id;
  }
  for (const id of existing?.screenshotIds ?? []) await write('DELETE', `/appScreenshots/${id}`);
  const ids = [];
  for (const f of files) {
    const reserved = await write('POST', '/appScreenshots', screenshotReservePayload(setId, f.name, f.size), 'appScreenshot');
    ids.push(reserved.data.id);
    for (const op of dryRun ? [] : reserved.data.attributes.uploadOperations ?? []) {
      const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
      const res = await client.fetchImpl(op.url, { method: op.method ?? 'PUT', headers, body: f.data.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new AscError(res.status, op.method ?? 'PUT', 'asset upload part', []);
    }
    await write('PATCH', `/appScreenshots/${reserved.data.id}`, screenshotCommitPayload(reserved.data.id, f.md5));
  }
  if (ids.length > 1) await write('PATCH', `/appScreenshotSets/${setId}/relationships/appScreenshots`, { data: ids.map((id) => ({ type: 'appScreenshots', id })) });
}

// ------------------------------------------------------------------ submit

export class InputError extends Error {}

export async function runSubmit({ client, meta, version, confirm, env = process.env, log = console.log }) {
  if (!version) throw new InputError('--version is required for submit');
  if (confirm !== meta.bundleId) throw new InputError(`refusing: --confirm must equal the bundle id (${meta.bundleId})`);
  const { state, blocking } = await runStatus({ client, meta, version, env });
  if (blocking.length) throw new InputError(`refusing: ${blocking.length} item(s) still block the submission (see the status above)`);
  for (const m of MANUAL_STEPS) log(`reminder: ${m}`);
  const submission = await client.request('POST', '/reviewSubmissions', { body: reviewSubmissionPayload(state.app.id) });
  const id = submission.data.id;
  await client.request('POST', '/reviewSubmissionItems', { body: reviewItemPayload(id, state.target.id) });
  await client.request('PATCH', `/reviewSubmissions/${id}`, { body: { data: { type: 'reviewSubmissions', id, attributes: { submitted: true } } } });
  log(`submitted version ${version} for review (submission ${id})`);
  return { id };
}

// ------------------------------------------------------------------ CLI

export function parseArgs(argv) {
  const [action, ...rest] = argv;
  const opts = { action, dryRun: false };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (['--version', '--build-number', '--confirm', '--metadata'].includes(a)) opts[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = rest[(i += 1)];
    else throw new InputError(`unknown argument ${a}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!['status', 'push', 'submit'].includes(opts.action)) throw new InputError('usage: asc-store.mjs <status|push|submit> [--version V] [--build-number N] [--dry-run] [--confirm BUNDLE_ID]');
  const meta = JSON.parse(readFileSync(opts.metadata ?? DEFAULT_METADATA, 'utf8'));
  const { ASC_API_KEY_PATH, ASC_API_KEY_ID, ASC_API_ISSUER_ID } = process.env;
  if (!ASC_API_KEY_PATH || !ASC_API_KEY_ID || !ASC_API_ISSUER_ID) throw new InputError('ASC_API_KEY_PATH, ASC_API_KEY_ID and ASC_API_ISSUER_ID are required');
  const signer = es256Signer(readFileSync(ASC_API_KEY_PATH, 'utf8'));
  const client = new AscClient({ tokenFn: () => buildJwt({ keyId: ASC_API_KEY_ID, issuerId: ASC_API_ISSUER_ID, sign: signer }) });
  if (opts.action === 'status') await runStatus({ client, meta, version: opts.version });
  else if (opts.action === 'push') await runPush({ client, meta, version: opts.version, buildNumber: opts.buildNumber, dryRun: opts.dryRun });
  else await runSubmit({ client, meta, version: opts.version, confirm: opts.confirm });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`asc-store: ${e.message}`);
    process.exit(e instanceof InputError ? 2 : 1);
  });
}
