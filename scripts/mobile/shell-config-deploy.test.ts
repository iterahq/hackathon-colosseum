// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareVersions } from '@iterahq/shell-bridge';
import { parseForceWebview, storeUrlFor } from '../../apps/mobile/src/shellGate';

// The deploy side of R-7: the file the web serves and the nginx block that serves it. `nginx -t` is not
// available here, so the Dockerfile's own printf is run and its output is read.
const root = path.resolve(__dirname, '../..');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');

function nginxConf(): string {
  const m = /RUN (printf .*?) > \/etc\/nginx\/conf\.d\/default\.conf/s.exec(dockerfile);
  if (!m) throw new Error('the nginx RUN printf was not found in the Dockerfile');
  return execFileSync('sh', ['-c', m[1].replace(/\\\n/g, '')], { encoding: 'utf8' });
}

describe('public/shell-config.json', () => {
  const text = readFileSync(path.join(root, 'public/shell-config.json'), 'utf8');
  const body = JSON.parse(text) as Record<string, unknown>;
  const contractDir = path.join(root, 'packages/bridge/contracts/shells');
  const newestShell = readdirSync(contractDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => (JSON.parse(readFileSync(path.join(contractDir, f), 'utf8')) as { shellVersion: string }).shellVersion)
    .reduce((a, b) => ((compareVersions(a, b) ?? 0) >= 0 ? a : b));
  const routePaths = new Set((JSON.parse(readFileSync(path.join(root, 'apps/mobile/route-map.json'), 'utf8')) as { routes: { path: string }[] }).routes.map((r) => r.path));

  it('minShellVersion is a version and never above the newest shell that exists (a higher value would brick every shell)', () => {
    expect(typeof body.minShellVersion).toBe('string');
    expect(compareVersions(body.minShellVersion as string, '0.0.0')).not.toBeNull();
    expect(compareVersions(body.minShellVersion as string, newestShell)).toBeLessThanOrEqual(0);
  });

  it('updateUrl is null or one URL per platform that the shell accepts, on its own store host', () => {
    if (body.updateUrl === null) return;
    const urls = body.updateUrl as { ios: string | null; android: string | null };
    expect(Object.keys(urls).sort()).toEqual(['android', 'ios']);
    for (const platform of ['ios', 'android'] as const) {
      if (urls[platform] !== null) expect(storeUrlFor(platform, urls)).toBe(urls[platform]);
    }
  });

  it('forceWebview is an array of routes that exist in apps/mobile/route-map.json, as the shell would read them', () => {
    expect(Array.isArray(body.forceWebview)).toBe(true);
    const list = body.forceWebview as string[];
    expect(parseForceWebview(list)).toEqual(list);
    for (const route of list) expect(routePaths, route).toContain(route);
  });

  it('has only the keys the shell reads, and stays small', () => {
    expect(Object.keys(body).sort()).toEqual(['forceWebview', 'minShellVersion', 'updateUrl']);
    expect(text.length).toBeLessThan(1024);
  });
});

describe('the nginx block of the Dockerfile', () => {
  const conf = nginxConf();
  const block = /location = \/shell-config\.json \{([^}]*)\}/.exec(conf)?.[1] ?? '';

  it('serves /shell-config.json with Cache-Control: no-cache', () => {
    expect(block).toMatch(/add_header Cache-Control "no-cache" always;/);
  });

  it('answers 404, not the SPA index.html, when the file is missing', () => {
    expect(block).toMatch(/try_files \$uri =404;/);
  });

  it('leaves the catch-all and the framing policy untouched', () => {
    expect(conf).toMatch(/location \/ \{\s*try_files \$uri \$uri\/ \/index\.html;\s*\}/);
    expect(conf).toMatch(/add_header Content-Security-Policy "frame-ancestors 'self' https:\/\/learn\.devfellowship\.com/);
    expect(conf).not.toMatch(/add_header X-Frame-Options/i);
  });
});
