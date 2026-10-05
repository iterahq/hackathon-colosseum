import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const eslint = new ESLint({ cwd: ROOT });

async function errors(code: string, file: string) {
  const [r] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return r.messages.filter((m) => m.severity === 2 && m.ruleId === 'no-restricted-syntax').map((m) => m.message);
}

describe('ADR-9: one test for "in the shell", the bridge handshake', () => {
  // The first lintText call loads the whole ESLint config; on a busy runner that alone exceeds the default 5 s.
  beforeAll(async () => {
    await errors('export {};', 'src/lib/Probe.ts');
  }, 120_000);

  it.each([
    ['navigator.userAgent', 'export const s = /Itera/.test(navigator.userAgent);'],
    ['window.navigator.userAgent', 'export const s = window.navigator.userAgent.includes("wv");'],
    ['navigator.userAgentData', 'export const s = (navigator as any).userAgentData?.mobile;'],
    ['window.ReactNativeWebView', 'export const s = Boolean((window as any).ReactNativeWebView);'],
    ['a bare ReactNativeWebView', 'declare const ReactNativeWebView: unknown; export const s = ReactNativeWebView;'],
    ['webkit.messageHandlers', 'export const s = Boolean((window as any).webkit?.messageHandlers);'],
    ['window["ReactNativeWebView"]', 'export const s = (window as any)["ReactNativeWebView"];'],
    ['window[`ReactNativeWebView`]', 'export const s = (window as any)[`ReactNativeWebView`];'],
    ['navigator["userAgent"]', 'export const s = navigator["userAgent"];'],
    ['a destructured userAgent', 'export const { userAgent } = navigator;'],
    ['a destructured ReactNativeWebView', 'export const { ReactNativeWebView } = window as any;'],
    ['"ReactNativeWebView" in window', 'export const s = "ReactNativeWebView" in window;'],
    ['Reflect.get(window, "ReactNativeWebView")', 'export const s = Reflect.get(window, "ReactNativeWebView");'],
    ['Reflect.has(window, "ReactNativeWebView")', 'export const s = Reflect.has(window, "ReactNativeWebView");'],
    ['webkit["messageHandlers"]', 'export const s = (window as any).webkit["messageHandlers"];'],
    ['"messageHandlers" in webkit', 'export const s = "messageHandlers" in ((window as any).webkit ?? {});'],
  ])('fails for %s in web code', async (_what, code) => {
    expect(await errors(code, 'src/lib/Probe.ts')).not.toEqual([]);
  });

  it('fails in a component and in the shell too', async () => {
    expect(await errors('export const s = navigator.userAgent;', 'src/components/Probe.tsx')).not.toEqual([]);
    expect(await errors('export const s = navigator.userAgent;', 'apps/mobile/src/probe.ts')).not.toEqual([]);
  });

  it('passes for a type-level mention: it reads nothing', async () => {
    expect(await errors('export type T = { ReactNativeWebView?: unknown };', 'src/lib/Probe.ts')).toEqual([]);
    expect(await errors('export interface W { ReactNativeWebView?: { postMessage(s: string): void } }', 'src/lib/Probe.ts')).toEqual([]);
  });

  it('passes for a string that only names the channel (the console forwarder source)', async () => {
    expect(await errors('export const S = "window.ReactNativeWebView.postMessage(x)";', 'src/lib/Probe.ts')).toEqual([]);
  });

  it('passes for the bridge client of src/lib/shellBridge.ts', async () => {
    const code = [
      "import { startShellBridge } from './shellBridge';",
      'export async function inShell() {',
      "  return (await startShellBridge()?.handshake())?.kind === 'shell';",
      '}',
    ].join('\n');
    expect(await errors(code, 'src/lib/Probe.ts')).toEqual([]);
  });

  it('allows packages/bridge to read the shell channel', async () => {
    expect(await errors('export const c = (window as any).ReactNativeWebView;', 'packages/bridge/src/Probe.ts')).toEqual([]);
  });
});
