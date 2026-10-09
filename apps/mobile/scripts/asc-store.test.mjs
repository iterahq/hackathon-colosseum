import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AscClient,
  blockingChecklist,
  buildJwt,
  es256Signer,
  FORBIDDEN_BILLING,
  gather,
  parseArgs,
  readScreenshots,
  reviewDetailAttrs,
  runPush,
  runStatus,
  runSubmit,
  validateMetadata,
  DEFAULT_SCREENSHOTS,
} from './asc-store.mjs';
import { pngInfo, shotFileName } from './store-screenshots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(readFileSync(path.join(HERE, '..', 'store', 'metadata.json'), 'utf8'));
const appJson = JSON.parse(readFileSync(path.join(HERE, '..', 'app.json'), 'utf8')).expo;
const clone = (o) => JSON.parse(JSON.stringify(o));
const APP = meta.ascAppId;
const NO_ENV = { GITHUB_STEP_SUMMARY: '' };

describe('buildJwt', () => {
  const parts = (jwt) => jwt.split('.').map((p, i) => (i < 2 ? JSON.parse(Buffer.from(p, 'base64url').toString()) : p));

  it('puts the ES256 header and the 15-minute claims in the token', () => {
    const jwt = buildJwt({ keyId: 'KID', issuerId: 'ISS', now: 1_700_000_000_000, sign: () => Buffer.from('sig') });
    const [header, claims, signature] = parts(jwt);
    expect(header).toEqual({ alg: 'ES256', kid: 'KID', typ: 'JWT' });
    expect(claims).toEqual({ iss: 'ISS', iat: 1_700_000_000, exp: 1_700_000_900, aud: 'appstoreconnect-v1' });
    expect(Buffer.from(signature, 'base64url').toString()).toBe('sig');
  });

  it('refuses without ids', () => {
    expect(() => buildJwt({ keyId: '', issuerId: 'ISS', sign: () => Buffer.alloc(0) })).toThrow(/required/);
  });

  it('signs with a real P-256 key in the raw r||s form that verifies', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const jwt = buildJwt({ keyId: 'K', issuerId: 'I', sign: es256Signer(pem) });
    const [h, c, s] = jwt.split('.');
    const sig = Buffer.from(s, 'base64url');
    expect(sig.length).toBe(64);
    expect(cryptoVerify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig)).toBe(true);
  });
});

describe('validateMetadata', () => {
  it('accepts the committed listing', () => {
    expect(validateMetadata(meta)).toEqual([]);
  });

  it('reports every length over the limit, naming the locale and the field', () => {
    const bad = clone(meta);
    bad.locales['pt-BR'].name = 'x'.repeat(31);
    bad.locales['en-US'].keywords = 'k'.repeat(101);
    bad.locales['en-US'].promotionalText = 'p'.repeat(171);
    bad.locales['pt-BR'].description = 'd'.repeat(4001);
    bad.locales['pt-BR'].subtitle = 's'.repeat(31);
    const errors = validateMetadata(bad).join('\n');
    for (const f of ['pt-BR.name', 'en-US.keywords', 'en-US.promotionalText', 'pt-BR.description', 'pt-BR.subtitle']) expect(errors).toContain(f);
  });

  it('counts characters, not UTF-16 units', () => {
    const ok = clone(meta);
    ok.locales['pt-BR'].name = '🎓'.repeat(30);
    expect(validateMetadata(ok)).toEqual([]);
  });

  it.each(['Assine já', 'Only 9 dollars per month, price $9', 'Start your free trial', 'Plano premium', 'Compre agora', 'In-app purchase', 'R$ 29'])(
    'rejects billing wording: %s',
    (text) => {
      const bad = clone(meta);
      bad.locales['en-US'].description = text;
      expect(validateMetadata(bad).join('\n')).toMatch(/names billing/);
    },
  );

  it('ignores look-alike words and does not scan the review notes, which may say there is no price', () => {
    expect(FORBIDDEN_BILLING.test('carefree buyers freedom')).toBe(false);
    const ok = clone(meta);
    ok.review.notes = 'The app has no price and no purchase.';
    expect(validateMetadata(ok)).toEqual([]);
  });

  it('flags missing top-level fields and a non-https privacy URL', () => {
    const bad = clone(meta);
    delete bad.copyright;
    bad.privacyPolicyUrl = 'http://iterahq.dev/privacy';
    const errors = validateMetadata(bad).join('\n');
    expect(errors).toContain('copyright is missing');
    expect(errors).toContain('privacyPolicyUrl must be an https URL');
  });

  it('is the listing the audit documents', () => {
    expect(meta.primaryCategory).toBe('EDUCATION');
    expect(meta.bundleId).toBe(appJson.ios.bundleIdentifier);
    expect(meta.marketingUrl).toBe('https://iterahq.dev');
    expect(Object.keys(meta.locales).sort()).toEqual(['en-US', 'pt-BR']);
    expect(Object.keys(meta.review)).toEqual(['notes']);
  });
});

describe('screenshots on disk', () => {
  it.each(['pt-BR', 'en-US'])('%s holds 4 to 6 PNGs of 1290x2796 without alpha, numbered in order', (locale) => {
    const files = readScreenshots(path.join(DEFAULT_SCREENSHOTS, locale, 'APP_IPHONE_67'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.length).toBeLessThanOrEqual(6);
    files.forEach((f, i) => expect(f.name.slice(0, 2)).toBe(String(i + 1).padStart(2, '0')));
    for (const f of files) expect(pngInfo(f.data)).toMatchObject({ width: 1290, height: 2796, hasAlpha: false });
  });

  it('names a shot NN-slug.png', () => {
    expect(shotFileName(0, 'login')).toBe('01-login.png');
    expect(shotFileName(9, 'x')).toBe('10-x.png');
  });

  it('rejects a buffer that is not a PNG', () => {
    expect(() => pngInfo(Buffer.from('hello'.repeat(10)))).toThrow(/not a PNG/);
  });
});

describe('privacy manifest in app.json', () => {
  const m = appJson.ios.privacyManifests;
  it('declares no tracking and the data the app really collects, all linked; analytics only where the page measures use or errors', () => {
    expect(m.NSPrivacyTracking).toBe(false);
    expect(m.NSPrivacyTrackingDomains).toEqual([]);
    expect(m.NSPrivacyCollectedDataTypes.map((t) => t.NSPrivacyCollectedDataType).sort()).toEqual(
      ['Name', 'EmailAddress', 'UserID', 'PhotosorVideos', 'OtherUserContent', 'ProductInteraction', 'CrashData', 'PerformanceData'].map((t) => `NSPrivacyCollectedDataType${t}`).sort(),
    );
    for (const t of m.NSPrivacyCollectedDataTypes) {
      expect(t.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(t.NSPrivacyCollectedDataTypeTracking).toBe(false);
      const measured = /(ProductInteraction|CrashData|PerformanceData)$/.test(t.NSPrivacyCollectedDataType);
      expect(t.NSPrivacyCollectedDataTypePurposes).toEqual(
        ['NSPrivacyCollectedDataTypePurposeAppFunctionality', ...(measured ? ['NSPrivacyCollectedDataTypePurposeAnalytics'] : [])],
      );
    }
  });

  it('holds the required-reason codes of the modules that ship no manifest', () => {
    const by = Object.fromEntries(m.NSPrivacyAccessedAPITypes.map((a) => [a.NSPrivacyAccessedAPIType, a.NSPrivacyAccessedAPITypeReasons]));
    expect(by.NSPrivacyAccessedAPICategoryFileTimestamp).toContain('C617.1');
    expect(by.NSPrivacyAccessedAPICategoryUserDefaults).toContain('CA92.1');
  });

  it('keeps the encryption flag and the phone-only target', () => {
    expect(appJson.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(appJson.ios.supportsTablet).toBe(false);
    expect(appJson.updates.checkAutomatically).toBe('NEVER');
  });
});

describe('reviewDetailAttrs', () => {
  it('skips what the env lacks, with warnings that never carry a value', () => {
    const { attrs, warnings } = reviewDetailAttrs(meta, {});
    expect(Object.keys(attrs)).toEqual(['notes']);
    expect(warnings).toHaveLength(5);
  });

  it('fills contact and demo account when the env has them', () => {
    const env = { ASC_REVIEW_CONTACT_FIRST_NAME: 'A', ASC_REVIEW_CONTACT_LAST_NAME: 'B', ASC_REVIEW_CONTACT_EMAIL: 'a@b.c', ASC_REVIEW_CONTACT_PHONE: '+0', ASC_REVIEW_DEMO_USER: 'u', ASC_REVIEW_DEMO_PASSWORD: 'p' };
    const { attrs, warnings } = reviewDetailAttrs(meta, env);
    expect(warnings).toEqual([]);
    expect(attrs).toMatchObject({ contactFirstName: 'A', contactPhone: '+0', demoAccountRequired: true, demoAccountName: 'u', demoAccountPassword: 'p' });
  });
});

describe('parseArgs', () => {
  it('reads the flags', () => {
    expect(parseArgs(['push', '--version', '0.3.0', '--build-number', '4', '--dry-run'])).toEqual({ action: 'push', dryRun: true, version: '0.3.0', buildNumber: '4' });
    expect(() => parseArgs(['status', '--nope'])).toThrow(/unknown argument/);
  });
});

// ---------------------------------------------------------------------- a fake App Store Connect

const SECRET_DEMO_NAME = 'demo-user-that-must-not-print';

function world({ complete = false, editable = true } = {}) {
  const loc = (locale, i) => ({ id: `${i}${locale}`, attributes: { locale, name: 'Itera', subtitle: 's', privacyPolicyUrl: 'https://x', description: 'd', keywords: 'k', supportUrl: 'https://x', promotionalText: 'p' } });
  const versions = editable || complete ? [{ id: 'v1', attributes: { versionString: '0.3.0', appStoreState: editable ? 'PREPARE_FOR_SUBMISSION' : 'READY_FOR_SALE', copyright: complete ? '2026 Itera' : null } }] : [];
  const routes = {
    [`/apps/${APP}`]: { data: { id: APP, attributes: { name: 'Itera', bundleId: meta.bundleId } } },
    [`/apps/${APP}/appStoreVersions`]: { data: versions },
    '/builds': { data: [{ id: 'b1', attributes: { version: '4', processingState: 'VALID', uploadedDate: '2026-10-07' }, relationships: { preReleaseVersion: { data: { id: 'p1' } } } }], included: [{ type: 'preReleaseVersions', id: 'p1', attributes: { version: '0.3.0' } }] },
    [`/apps/${APP}/appInfos`]: { data: [{ id: 'i1', attributes: { appStoreState: 'PREPARE_FOR_SUBMISSION' } }] },
    '/appInfos/i1/appInfoLocalizations': { data: complete ? [loc('pt-BR', 'a'), loc('en-US', 'a')] : [] },
    '/appInfos/i1/primaryCategory': { data: complete ? { id: 'EDUCATION' } : null },
    '/appInfos/i1/ageRatingDeclaration': { data: { id: 'ar1', attributes: complete ? { ...meta.ageRating, kidsAgeBand: null, ageRatingOverride: null } : { ...meta.ageRating, gambling: null, kidsAgeBand: null } } },
    [`/apps/${APP}/appPriceSchedule`]: complete ? { data: { id: 'ps' } } : null,
    '/appStoreVersions/v1/appStoreVersionLocalizations': { data: complete ? [loc('pt-BR', 'b'), loc('en-US', 'b')] : [] },
    '/appStoreVersions/v1/build': { data: complete ? { id: 'b1', attributes: { version: '4' } } : null },
    '/appStoreVersions/v1/appStoreReviewDetail': {
      data: complete ? { id: 'rd1', attributes: { contactFirstName: 'A', contactLastName: 'B', contactEmail: 'a@b.c', contactPhone: '+0', demoAccountRequired: true, demoAccountName: SECRET_DEMO_NAME, demoAccountPassword: 'pw', notes: 'n' } } : null,
    },
  };
  for (const l of ['bpt-BR', 'ben-US']) {
    routes[`/appStoreVersionLocalizations/${l}/appScreenshotSets`] = {
      data: complete ? [{ id: `set-${l}`, attributes: { screenshotDisplayType: 'APP_IPHONE_67' }, relationships: { appScreenshots: { data: [{ id: `old-${l}` }] } } }] : [],
    };
  }
  return routes;
}

function fakeFetch(routes, writes = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const u = new URL(url);
    calls.push({ method, path: u.pathname.replace(/^\/v1/, ''), url, body: init.body, headers: init.headers });
    const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === null ? '' : JSON.stringify(body)) });
    if (u.hostname !== 'api.appstoreconnect.apple.com') return { ok: true, status: 200, text: async () => '' };
    const p = u.pathname.replace(/^\/v1/, '');
    if (method === 'GET') return p in routes ? (routes[p] === null ? json(404, { errors: [{ title: 'Not found' }] }) : json(200, routes[p])) : json(404, { errors: [{ title: `no route ${p}` }] });
    const handler = writes[`${method} ${p}`];
    if (handler) return json(200, handler(init.body ? JSON.parse(init.body) : null));
    return json(200, { data: { id: `new-${calls.length}`, attributes: { uploadOperations: [{ method: 'PUT', url: 'https://upload.example/part', offset: 0, length: 5, requestHeaders: [{ name: 'Content-Type', value: 'image/png' }] }] } } });
  };
  return { fetchImpl, calls };
}

const clientOf = (fetchImpl) => new AscClient({ fetchImpl, tokenFn: () => 'TOKEN-NOT-PRINTED' });

describe('AscClient', () => {
  it('sends the token to the App Store Connect origin only', async () => {
    const { fetchImpl, calls } = fakeFetch(world());
    const client = clientOf(fetchImpl);
    for (const target of ['https://evil.example/v1/apps', '@evil.example/apps']) {
      await expect(client.get(target)).rejects.toThrow(/refused a request outside/);
    }
    expect(calls).toEqual([]);
  });
});

describe('status', () => {
  it('lists what blocks an empty listing and never prints a credential', async () => {
    const { fetchImpl, calls } = fakeFetch(world());
    const out = [];
    const spy = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => (out.push(String(s)), true);
    let result;
    try {
      result = await runStatus({ client: clientOf(fetchImpl), meta, version: '0.3.0', env: NO_ENV });
    } finally {
      process.stdout.write = spy;
    }
    const text = out.join('');
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(result.blocking).toEqual(
      expect.arrayContaining(['no build is attached to the version', 'copyright is empty', 'primary category is not set', 'pt-BR: no app info localization', 'review detail is missing', 'price schedule is not set (a free app still needs the free price point)']),
    );
    expect(result.blocking).toContain('age rating declaration has unanswered questions: gambling');
    expect(text).toContain('| 0.3.0 | PREPARE_FOR_SUBMISSION |');
    expect(text).not.toContain('TOKEN-NOT-PRINTED');
  });

  it('reports a complete listing as unblocked and hides the demo account', async () => {
    const { fetchImpl } = fakeFetch(world({ complete: true }));
    const st = await gather(clientOf(fetchImpl), meta, '0.3.0');
    expect(blockingChecklist(st, meta)).toEqual([]);
    expect(JSON.stringify(st)).not.toContain(SECRET_DEMO_NAME);
    expect(st.target.localizations[0].screenshots).toEqual({ APP_IPHONE_67: 1 });
  });

  it('blocks a version that is no longer editable and a build still processing', async () => {
    const w = world({ complete: true, editable: false });
    w['/builds'].data[0].attributes.processingState = 'PROCESSING';
    const st = await gather(clientOf(fakeFetch(w).fetchImpl), meta, '0.3.0');
    expect(blockingChecklist(st, meta).join('\n')).toMatch(/READY_FOR_SALE", not editable/);
    expect(blockingChecklist(st, meta)).toContain('no build finished processing (VALID)');
  });
});

describe('push --dry-run', () => {
  it('sends only GETs and plans the version, the localizations, the screenshots and the build', async () => {
    const { fetchImpl, calls } = fakeFetch(world({ editable: false }));
    const lines = [];
    const { plan } = await runPush({ client: clientOf(fetchImpl), meta, version: '0.3.0', buildNumber: '4', dryRun: true, env: {}, log: (l) => lines.push(l) });
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(plan).toContain('POST /appStoreVersions [platform, versionString]');
    expect(plan.some((p) => p.startsWith('POST /appStoreVersionLocalizations'))).toBe(true);
    expect(plan.filter((p) => p.startsWith('POST /appScreenshots ['))).toHaveLength(10);
    expect(plan.some((p) => p.includes('/relationships/build'))).toBe(true);
    expect(lines.join('\n')).toContain('ASC_REVIEW_DEMO_USER');
    expect(lines.join('\n')).not.toContain('TOKEN-NOT-PRINTED');
  });

  it('refuses invalid metadata before any call', async () => {
    const { fetchImpl, calls } = fakeFetch(world());
    const bad = clone(meta);
    bad.locales['pt-BR'].subtitle = 'Assine agora';
    await expect(runPush({ client: clientOf(fetchImpl), meta: bad, version: '0.3.0', dryRun: true, env: {}, log: () => {} })).rejects.toThrow(/names billing/);
    expect(calls).toHaveLength(0);
  });

  it('renames a draft that was never submitted instead of creating a second editable version', async () => {
    const { fetchImpl, calls } = fakeFetch(world());
    const { plan } = await runPush({ client: clientOf(fetchImpl), meta, version: '0.9.0', dryRun: true, env: {}, log: () => {} });
    expect(plan[0]).toBe('PATCH /appStoreVersions/v1 [versionString]');
    expect(plan.some((l) => l.startsWith('POST /appStoreVersions'))).toBe(false);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('refuses to create a second editable version next to a rejected one', async () => {
    const w = world();
    w[`/apps/${APP}/appStoreVersions`].data[0].attributes.appStoreState = 'REJECTED';
    const { fetchImpl } = fakeFetch(w);
    await expect(runPush({ client: clientOf(fetchImpl), meta, version: '0.9.0', dryRun: true, env: {}, log: () => {} })).rejects.toThrow(/another version is editable \(0\.3\.0, "REJECTED"\)/);
  });
});

describe('push (real writes against the fake)', () => {
  it('replaces the screenshots: deletes the old ones, PUTs the part, commits with the MD5, orders the set', async () => {
    const { fetchImpl, calls } = fakeFetch(world({ complete: true }));
    await runPush({ client: clientOf(fetchImpl), meta, version: '0.3.0', buildNumber: '4', env: {}, log: () => {} });
    const methods = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);
    expect(methods).toContain('DELETE /appScreenshots/old-bpt-BR');
    expect(methods).toContain('PATCH /appStoreVersions/v1/relationships/build');
    expect(methods).toContain('PATCH /appStoreReviewDetails/rd1');
    expect(methods.indexOf('PATCH /appStoreVersions/v1/relationships/build')).toBeLessThan(methods.indexOf('PATCH /appStoreReviewDetails/rd1'));
    expect(methods).toContain('PATCH /appInfoLocalizations/apt-BR');
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(10);
    expect(puts[0].headers['Content-Type']).toBe('image/png');
    const commit = calls.find((c) => c.method === 'PATCH' && /^\/appScreenshots\/new-/.test(c.path));
    expect(JSON.parse(commit.body).data.attributes).toMatchObject({ uploaded: true, sourceFileChecksum: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect(calls.some((c) => c.method === 'PATCH' && c.path.endsWith('/relationships/appScreenshots'))).toBe(true);
  });
});

describe('push (what App Store Connect does on its own)', () => {
  it('keeps the current name of a locale when the listing name is taken there, and writes the rest', async () => {
    const { fetchImpl, calls } = fakeFetch(world({ complete: true }));
    const taken = async (url, init = {}) => {
      const named = init.method === 'PATCH' && url.endsWith('/appInfoLocalizations/aen-US') && 'name' in JSON.parse(init.body).data.attributes;
      if (!named) return fetchImpl(url, init);
      return { ok: false, status: 409, text: async () => JSON.stringify({ errors: [{ code: 'ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE.DIFFERENT_ACCOUNT', title: 'used', detail: 'The app name you entered is already being used.' }] }) };
    };
    const out = [];
    await runPush({ client: clientOf(taken), meta, version: '0.3.0', env: {}, log: (l) => out.push(l) });
    expect(out.join('\n')).toMatch(/en-US: the name "Itera" is taken on the App Store; kept "Itera"/);
    const sent = calls.filter((c) => c.method === 'PATCH' && c.path === '/appInfoLocalizations/aen-US').map((c) => Object.keys(JSON.parse(c.body).data.attributes));
    expect(sent).toEqual([['subtitle', 'privacyPolicyUrl']]);
    expect(calls.some((c) => c.method === 'PATCH' && c.path === '/appStoreReviewDetails/rd1')).toBe(true);
  });

  it('reads the version localization App Store Connect created with a new appInfo localization, instead of creating it again', async () => {
    const w = world();
    const { fetchImpl, calls } = fakeFetch(w, {
      'POST /appInfoLocalizations': (body) => {
        const { locale } = body.data.attributes;
        w['/appStoreVersions/v1/appStoreVersionLocalizations'].data.push({ id: `auto-${locale}`, attributes: { locale } });
        w[`/appStoreVersionLocalizations/auto-${locale}/appScreenshotSets`] = { data: [] };
        return { data: { id: `info-${locale}` } };
      },
    });
    await runPush({ client: clientOf(fetchImpl), meta, version: '0.3.0', env: {}, log: () => {} });
    const writes = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);
    expect(writes).toContain('PATCH /appStoreVersionLocalizations/auto-pt-BR');
    expect(writes).not.toContain('POST /appStoreVersionLocalizations');
  });
});

describe('submit', () => {
  it('refuses a wrong confirmation before any call', async () => {
    const { fetchImpl, calls } = fakeFetch(world({ complete: true }));
    await expect(runSubmit({ client: clientOf(fetchImpl), meta, version: '0.3.0', confirm: 'nope', env: NO_ENV, log: () => {} })).rejects.toThrow(/--confirm must equal the bundle id/);
    expect(calls).toHaveLength(0);
  });

  it('refuses while the checklist is not empty and sends no write', async () => {
    const { fetchImpl, calls } = fakeFetch(world());
    const spy = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await expect(runSubmit({ client: clientOf(fetchImpl), meta, version: '0.3.0', confirm: meta.bundleId, env: NO_ENV, log: () => {} })).rejects.toThrow(/still block/);
    } finally {
      process.stdout.write = spy;
    }
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('creates the submission, adds the version and submits when nothing blocks', async () => {
    const { fetchImpl, calls } = fakeFetch(world({ complete: true }), { 'POST /reviewSubmissions': () => ({ data: { id: 'rs1' } }) });
    const spy = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await runSubmit({ client: clientOf(fetchImpl), meta, version: '0.3.0', confirm: meta.bundleId, env: NO_ENV, log: () => {} });
    } finally {
      process.stdout.write = spy;
    }
    const writes = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);
    expect(writes).toEqual(['POST /reviewSubmissions', 'POST /reviewSubmissionItems', 'PATCH /reviewSubmissions/rs1']);
    expect(JSON.parse(calls.at(-1).body).data.attributes).toEqual({ submitted: true });
  });
});
