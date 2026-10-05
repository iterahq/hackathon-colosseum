import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { METHODS, SUPPORTED_PROTOCOLS, compareVersions, type Method } from './protocol';
import { wire } from './wire.testkit';

interface ShellContract {
  shellVersion: string;
  bridge: boolean;
  protocols: number[];
  capabilities: string[];
}

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'contracts', 'shells');
export const CONTRACTS: ShellContract[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const c = JSON.parse(readFileSync(path.join(DIR, f), 'utf-8')) as ShellContract;
    if (`${c.shellVersion}.json` !== f) throw new Error(`${f}: the file name must be the shellVersion`);
    return c;
  })
  .sort((a, b) => compareVersions(a.shellVersion, b.shellVersion) ?? 0);

/** The native handlers a shell of this contract registers: every capability answers with its version. */
const handlersOf = (contract: ShellContract) =>
  Object.fromEntries(
    contract.capabilities.map((m) => [m, () => (m === 'shell.version' ? { shellVersion: contract.shellVersion, protocol: 1 } : {})]),
  );

describe('the contracts of the supported shells', () => {
  it('there is at least one supported shell, and each contract names only methods of the protocol', () => {
    expect(CONTRACTS.length).toBeGreaterThan(0);
    for (const c of CONTRACTS) {
      expect(compareVersions(c.shellVersion, '0.0.0'), c.shellVersion).not.toBeNull();
      for (const m of c.capabilities) expect(METHODS as readonly string[], `${c.shellVersion}: ${m}`).toContain(m);
      if (!c.bridge) expect(c.capabilities).toEqual([]);
    }
  });

  it('the current web reads a protocol of every supported shell that has a bridge', () => {
    for (const c of CONTRACTS.filter((x) => x.bridge)) {
      expect(c.protocols.some((p) => SUPPORTED_PROTOCOLS.includes(p)), `shell ${c.shellVersion} reads ${c.protocols}`).toBe(true);
    }
  });
});

describe.each(CONTRACTS.map((c) => [c.shellVersion, c] as const))('the current web against shell %s', (_v, contract) => {
  it('the handshake gives shell mode with the contract capabilities, or the web mode', async () => {
    const w = wire({ shell: contract.bridge ? { handlers: handlersOf(contract), shellVersion: contract.shellVersion } : null });
    const mode = await w.client.handshake();
    await w.flush();
    if (!contract.bridge) {
      expect(mode).toMatchObject({ kind: 'web', reason: 'timeout' });
      expect(w.client.has('shell.version')).toBe(false);
      return;
    }
    expect(mode).toMatchObject({ kind: 'shell', shellVersion: contract.shellVersion });
    expect(mode.kind === 'shell' ? [...mode.capabilities].sort() : null).toEqual([...contract.capabilities].sort());
    for (const m of METHODS) expect(w.client.has(m as Method), `${contract.shellVersion} ${m}`).toBe(contract.capabilities.includes(m));
  });

  it('shell.version round-trips when the contract offers it, and is refused locally otherwise', async () => {
    const w = wire({ shell: contract.bridge ? { handlers: handlersOf(contract), shellVersion: contract.shellVersion } : null });
    await w.client.handshake();
    const call = w.client.call('shell.version', {});
    if (contract.capabilities.includes('shell.version')) {
      await expect(call).resolves.toEqual({ shellVersion: contract.shellVersion, protocol: 1 });
    } else {
      await expect(call).rejects.toMatchObject({ reason: expect.stringMatching(/^(no_handshake|capability_absent)$/) });
    }
    await w.flush();
    expect(w.shellOutcomes.filter((o) => o.refused)).toEqual([]);
  });

  it('keepAwake round-trips when the contract offers it; otherwise the page never sends it (a 0.1.0 shell is never asked)', async () => {
    const offered = contract.capabilities.includes('keepAwake');
    const w = wire({ shell: contract.bridge ? { handlers: { ...handlersOf(contract), ...(offered ? { keepAwake: (p: unknown) => ({ on: (p as { on: boolean }).on }) } : {}) }, shellVersion: contract.shellVersion } : null });
    await w.client.handshake();
    const before = w.sent.length;
    const call = w.client.call('keepAwake', { on: true });
    if (offered) {
      await expect(call).resolves.toEqual({ on: true });
      expect(w.sent.length).toBe(before + 1);
    } else {
      await expect(call).rejects.toBeDefined();
      expect(w.sent.length).toBe(before);
    }
    await w.flush();
    expect(w.shellOutcomes.filter((o) => o.refused)).toEqual([]);
  });

  it('a method outside the contract never leaves the page', async () => {
    const w = wire({ shell: contract.bridge ? { handlers: handlersOf(contract), shellVersion: contract.shellVersion } : null });
    await w.client.handshake();
    const before = w.sent.length;
    await expect(w.client.call('auth.session', { signedOut: true })).rejects.toBeDefined();
    expect(w.sent.length).toBe(before);
  });
});
