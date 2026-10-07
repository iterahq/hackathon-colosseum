// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Tool {
  normalizeFingerprint(input: string): string;
  listFingerprints(text: string): string[];
  addFingerprint(text: string, input: string): { status: 'added' | 'present'; text: string; fingerprints: string[] };
}

// A plain .mjs run with no install; loaded by URL so the root `tsc` needs no types for it.
const tool = (await import(new URL('../../apps/mobile/scripts/add-assetlinks-fingerprint.mjs', import.meta.url).href)) as Tool;
const SCRIPT = path.resolve(__dirname, '../../apps/mobile/scripts/add-assetlinks-fingerprint.mjs');
const REAL = readFileSync(path.resolve(__dirname, '../../public/.well-known/assetlinks.json'), 'utf8');

const EAS = '21:8E:E0:58:D7:3A:8E:DE:76:B4:A3:02:DB:98:05:51:34:7C:1C:13:29:08:FD:D3:98:D1:DE:5B:97:15:92:0F';
const PLAY = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';
const PLAY_HEX = PLAY.replaceAll(':', '');
const file = (fps: string[], extra: Record<string, unknown> = {}) =>
  `${JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.tainanfidelis.iterahq', sha256_cert_fingerprints: fps, ...extra } }], null, 2)}\n`;

describe('normalizeFingerprint', () => {
  it('keeps the upper-case colon form', () => expect(tool.normalizeFingerprint(PLAY)).toBe(PLAY));
  it('upper-cases a lower-case or mixed-case colon form', () => {
    expect(tool.normalizeFingerprint(PLAY.toLowerCase())).toBe(PLAY);
    expect(tool.normalizeFingerprint('Ab:cD' + PLAY.slice(5))).toBe(PLAY);
  });
  it('accepts 64 hex characters, either case, and surrounding whitespace', () => {
    expect(tool.normalizeFingerprint(PLAY_HEX)).toBe(PLAY);
    expect(tool.normalizeFingerprint(PLAY_HEX.toLowerCase())).toBe(PLAY);
    expect(tool.normalizeFingerprint(` ${PLAY_HEX}\n`)).toBe(PLAY);
  });
  it.each([
    ['empty', ''],
    ['too short', PLAY.slice(0, -3)],
    ['too long', `${PLAY}:00`],
    ['63 hex', PLAY_HEX.slice(1)],
    ['65 hex', `${PLAY_HEX}0`],
    ['non-hex', `${PLAY_HEX.slice(0, 62)}ZZ`],
    ['non-hex with colons', `${PLAY.slice(0, -2)}GG`],
    ['mixed separators', PLAY.replace(':', '-')],
    ['SHA-1 length', PLAY.slice(0, 59)],
    ['a prefix', `SHA256: ${PLAY}`],
  ])('refuses %s', (_n, v) => expect(() => tool.normalizeFingerprint(v)).toThrow(/fingerprint/));
});

describe('addFingerprint', () => {
  it('the real file is already in the format the script writes', () => {
    expect(tool.addFingerprint(REAL, EAS).status).toBe('present');
    expect(tool.listFingerprints(REAL)[0]).toBe(EAS);
  });
  it('appends after the EAS key and keeps the formatting', () => {
    const r = tool.addFingerprint(file([EAS]), PLAY_HEX.toLowerCase());
    expect(r.status).toBe('added');
    expect(r.fingerprints).toEqual([EAS, PLAY]);
    expect(r.text).toBe(file([EAS, PLAY]));
  });
  it('a duplicate (any spelling) is already present and the text is untouched', () => {
    const text = file([EAS, PLAY]);
    for (const spelling of [PLAY, PLAY.toLowerCase(), PLAY_HEX]) {
      const r = tool.addFingerprint(text, spelling);
      expect(r.status).toBe('present');
      expect(r.text).toBe(text);
    }
    expect(tool.addFingerprint(file([EAS]), EAS.replaceAll(':', '').toLowerCase()).status).toBe('present');
  });
  it('never removes a fingerprint', () => {
    const r = tool.addFingerprint(file([EAS, PLAY]), 'FF'.repeat(32));
    expect(r.fingerprints).toEqual([EAS, PLAY, 'FF:'.repeat(31) + 'FF']);
  });
  it('a bad fingerprint is refused before the file is read', () => expect(() => tool.addFingerprint('not json', 'zz')).toThrow(/fingerprint/));
  it.each([
    ['not JSON', '{'],
    ['not an array', '{}\n'],
    ['no statement for the package', `${JSON.stringify([{ target: { package_name: 'other' } }], null, 2)}\n`],
    ['two statements for the package', `${JSON.stringify([...JSON.parse(file([EAS])), ...JSON.parse(file([EAS]))], null, 2)}\n`],
    ['a different relation', file([EAS]).replace('handle_all_urls', 'get_login_creds')],
    ['an empty list', file([])],
    ['a lower-case fingerprint in the file', file([EAS.toLowerCase()])],
    ['a duplicate in the file', file([EAS, EAS])],
    ['a wrong namespace', file([EAS], { namespace: 'web' })],
    ['other formatting (4 spaces)', JSON.stringify(JSON.parse(file([EAS])), null, 4) + '\n'],
    ['no final newline', file([EAS]).trimEnd()],
  ])('refuses a file with %s', (_n, text) => expect(() => tool.addFingerprint(text, PLAY)).toThrow());
});

describe('the command', () => {
  const run = (target: string, ...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { env: { ...process.env, ASSETLINKS_FILE: target }, encoding: 'utf8' });
  const tmp = (text: string) => {
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'assetlinks-')), 'assetlinks.json');
    writeFileSync(f, text);
    return f;
  };

  it('adds, then reports already present on the second run', () => {
    const f = tmp(file([EAS]));
    const a = run(f, PLAY_HEX);
    expect(a.status).toBe(0);
    expect(a.stdout).toContain(`added: ${PLAY}`);
    expect(readFileSync(f, 'utf8')).toBe(file([EAS, PLAY]));
    const b = run(f, PLAY);
    expect(b.status).toBe(0);
    expect(b.stdout).toContain('already present');
    expect(readFileSync(f, 'utf8')).toBe(file([EAS, PLAY]));
  });
  it('refuses a bad fingerprint with exit 1 and leaves the file alone', () => {
    const f = tmp(file([EAS]));
    const r = run(f, 'nope');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not a SHA-256 fingerprint/);
    expect(readFileSync(f, 'utf8')).toBe(file([EAS]));
  });
  it('refuses an unexpected file with exit 1 and does not rewrite it', () => {
    const odd = '[]\n';
    const f = tmp(odd);
    const r = run(f, PLAY);
    expect(r.status).toBe(1);
    expect(readFileSync(f, 'utf8')).toBe(odd);
  });
  it('--check prints the list and exits 0', () => {
    const f = tmp(file([EAS, PLAY]));
    const r = run(f, '--check');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(EAS);
    expect(r.stdout).toContain(PLAY);
    expect(readFileSync(f, 'utf8')).toBe(file([EAS, PLAY]));
  });
  it('without an argument it prints the usage and exits 1', () => expect(run(tmp(file([EAS]))).status).toBe(1));
  it('on the real file --check works with no override', () => {
    expect(execFileSync('node', [SCRIPT, '--check'], { encoding: 'utf8' })).toContain(EAS);
  });
});
