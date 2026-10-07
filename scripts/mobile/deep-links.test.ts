// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appConsts, loadRepo, parseAppRoutes } from './oneCopyRules';

// R-5: the universal-link claim. The learner paths come from apps/mobile/route-map.json (owner: Tainan);
// the staff zone (admin, author, live instructor) stays in the browser. A file that drifts from the map fails here.
const root = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const routes = (JSON.parse(read('apps/mobile/route-map.json')) as { routes: { path: string }[] }).routes.map((r) => r.path);
const dockerfile = read('Dockerfile');

const APP_ID = 'P7WN2R8S4C.com.tainanfidelis.iterahq';
const HOST = 'app.iterahq.dev';
const STAFF = ['/admin', '/author', '/live/instructor'];
const isStaff = (p: string) => STAFF.some((s) => p === s || p.startsWith(`${s}/`));
// Routes that `src/App.tsx` wraps in <WebOnlyRoute> (W-7: no sign-up, price or checkout in the app) never open the app.
// Read from the file as text, as one-copy rule 3b does: a path that becomes web-only later fails here until it leaves the claim.
const appRepo = loadRepo(root);
const webOnly = parseAppRoutes(appRepo.read('src/App.tsx'), appConsts(appRepo))
  .filter((r) => /<WebOnlyRoute[\s>]/.test(r.element))
  .map((r) => r.path);
// Returns that carry a Supabase session on the IMPLICIT flow (the web sets no `flowType`, src/lib/supabase/client.ts):
// `#access_token=…&refresh_token=…`. ADR-10: no refresh token reaches native code, so these finish in the browser.
// `/` (magic link, OAuth) cannot be unclaimed; the shell drops a refresh_token fragment instead (deepLink.ts).
const SESSION_RETURNS: Record<string, string> = {
  '/auth/reset': 'password-reset e-mail returns with #access_token&refresh_token&type=recovery (passwordReset.service.ts)',
};
const learner = routes.filter((p) => p !== '*' && !isStaff(p) && !webOnly.includes(p) && !(p in SESSION_RETURNS));
const staff = routes.filter(isStaff);
const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, 'abc');

interface Component {
  '/': string;
  exclude?: boolean;
}
const aasaText = read('public/.well-known/apple-app-site-association');
const aasa = JSON.parse(aasaText) as { applinks: { details: { appIDs: string[]; components: Component[] }[] } };
const components = aasa.applinks.details[0].components;

/** iOS evaluates components in order; the first match decides. `*` matches any run of characters. */
function claimedOnIos(p: string): boolean {
  for (const c of components) {
    const re = new RegExp(`^${c['/'].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    if (re.test(p)) return c.exclude !== true;
  }
  return false;
}

const expo = (JSON.parse(read('apps/mobile/app.json')) as { expo: { ios: { associatedDomains: string[] }; android: { intentFilters: { action: string; autoVerify: boolean; data: { scheme: string; host: string; path?: string; pathPrefix?: string }[]; category: string[] }[] } } }).expo;

function claimedOnAndroid(p: string): boolean {
  return expo.android.intentFilters.some((f) =>
    f.data.some((d) => d.scheme === 'https' && d.host === HOST && (d.path === p || (d.pathPrefix !== undefined && p.startsWith(d.pathPrefix)))),
  );
}

describe('public/.well-known/apple-app-site-association', () => {
  it('is applinks only, for the one app id, with components', () => {
    expect(Object.keys(aasa)).toEqual(['applinks']);
    expect(Object.keys(aasa.applinks).sort()).toEqual(['details']);
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0].appIDs).toEqual([APP_ID]);
    expect(Object.keys(aasa.applinks.details[0]).sort()).toEqual(['appIDs', 'components']);
  });

  it('claims exactly the learner paths of the route map, plus /auth/dfl/callback, and not a session-carrying return', () => {
    expect(learner).toContain('/auth/dfl/callback');
    const want = learner.map((p) => (p.includes(':') ? `${p.split(':')[0]}*` : p)).sort();
    const got = components.filter((c) => c.exclude !== true).map((c) => c['/']).sort();
    expect(got).toEqual(want);
  });

  it('finds the web-only routes of App.tsx, and claims none of them', () => {
    expect(webOnly).toEqual(expect.arrayContaining(['/signup', '/subscribe', '/subscribe/return']));
    for (const p of webOnly) expect(claimedOnIos(concrete(p)), p).toBe(false);
  });

  it('claims no return that carries a session on the implicit flow', () => {
    for (const p of Object.keys(SESSION_RETURNS)) {
      expect(routes, p).toContain(p);
      expect(claimedOnIos(p), p).toBe(false);
      expect(claimedOnAndroid(p), p).toBe(false);
    }
  });

  it('claims every concrete learner path', () => {
    for (const p of learner) expect(claimedOnIos(concrete(p)), p).toBe(true);
  });

  it('leaves every staff path in the browser, including a staff path that a learner prefix would swallow', () => {
    for (const p of staff) expect(claimedOnIos(concrete(p)), p).toBe(false);
    expect(claimedOnIos('/live/instructor')).toBe(false);
    expect(claimedOnIos('/live/instructor/report/x')).toBe(false);
    expect(claimedOnIos('/live/123')).toBe(true);
  });

  it('claims nothing the route map does not know', () => {
    expect(claimedOnIos('/prototipo/cena')).toBe(false);
    expect(claimedOnIos('/anything-else')).toBe(false);
  });

  it('names no query or fragment rule: a link keeps both', () => {
    expect(aasaText).not.toMatch(/"[?#]"/);
  });
});

describe('apps/mobile/app.json', () => {
  it('iOS: one associated domain, the app host', () => {
    expect(expo.ios.associatedDomains).toEqual([`applinks:${HOST}`]);
  });

  it('Android: one auto-verified https filter for the app host, and nothing else', () => {
    expect(expo.android.intentFilters).toHaveLength(1);
    const f = expo.android.intentFilters[0];
    expect(f.action).toBe('VIEW');
    expect(f.autoVerify).toBe(true);
    expect([...f.category].sort()).toEqual(['BROWSABLE', 'DEFAULT']);
    for (const d of f.data) {
      expect(d.scheme).toBe('https');
      expect(d.host).toBe(HOST);
    }
  });

  it('Android: claims no web-only path of App.tsx', () => {
    for (const p of webOnly) expect(claimedOnAndroid(concrete(p)), p).toBe(false);
  });

  it('Android: claims every learner path except the dynamic /live/:sessionId, and no staff path', () => {
    // An Android filter cannot exclude: a `/live/` prefix would also claim /live/instructor, so that one route stays in the browser.
    for (const p of learner) expect(claimedOnAndroid(concrete(p)), p).toBe(p !== '/live/:sessionId');
    for (const p of staff) expect(claimedOnAndroid(concrete(p)), p).toBe(false);
  });
});

// The EAS upload key signs the preview APK; the Play App Signing key joins it (apps/mobile/scripts/add-assetlinks-fingerprint.mjs), never replaces it.
const EAS_UPLOAD_KEY = '21:8E:E0:58:D7:3A:8E:DE:76:B4:A3:02:DB:98:05:51:34:7C:1C:13:29:08:FD:D3:98:D1:DE:5B:97:15:92:0F';

describe('public/.well-known/assetlinks.json', () => {
  const file = path.join(root, 'public/.well-known/assetlinks.json');
  it('exists: the EAS upload key (preview APK); the Play App Signing key is added when the Play Console app exists', () => {
    expect(existsSync(file)).toBe(true);
  });
  it('names the package and one to N SHA-256 certificate fingerprints, the EAS upload key always among them', () => {
    const body = JSON.parse(readFileSync(file, 'utf8')) as { relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(body).toHaveLength(1);
    expect(body[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(body[0].target.namespace).toBe('android_app');
    expect(body[0].target.package_name).toBe('com.tainanfidelis.iterahq');
    const fps = body[0].target.sha256_cert_fingerprints;
    expect(fps.length).toBeGreaterThanOrEqual(1);
    for (const fp of fps) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(new Set(fps).size).toBe(fps.length);
    expect(fps).toContain(EAS_UPLOAD_KEY);
  });
});

function nginxConf(): string {
  const m = /RUN (printf .*?) > \/etc\/nginx\/conf\.d\/default\.conf/s.exec(dockerfile);
  if (!m) throw new Error('the nginx RUN printf was not found in the Dockerfile');
  return execFileSync('sh', ['-c', m[1].replace(/\\\n/g, '')], { encoding: 'utf8' });
}

describe('the nginx blocks of the Dockerfile for /.well-known', () => {
  const conf = nginxConf();
  for (const name of ['apple-app-site-association', 'assetlinks.json']) {
    const block = new RegExp(`location = /\\.well-known/${name.replace('.', '\\.')} \\{([^}]*)\\}`).exec(conf)?.[1] ?? '';
    it(`${name}: exact location, JSON content type, no compression, no redirect, 404 and never the SPA fallback`, () => {
      expect(block).not.toBe('');
      expect(block).toMatch(/default_type application\/json;/);
      expect(block).toMatch(/gzip off;/);
      expect(block).toMatch(/try_files \$uri =404;/);
      expect(block).not.toMatch(/return |rewrite |index\.html/);
    });
  }

  it('leaves the catch-all untouched', () => {
    expect(conf).toMatch(/location \/ \{\s*try_files \$uri \$uri\/ \/index\.html;\s*\}/);
  });
});
