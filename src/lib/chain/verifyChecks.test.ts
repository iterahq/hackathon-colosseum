import { describe, expect, it } from 'vitest';
import { acceptFunctionSource, compareBinary, evidenceShellLine, evidenceVerdict, instructionRows, type EscrowIdl } from '@/lib/chain/verifyChecks';
import { sha256Hex } from '@/lib/chain/base58';

describe('verify checks', () => {
  it('cuts the accept function out of the source', () => {
    const source = ['fn other() {', '    a();', '}', '', '/// doc', 'fn accept(x: u8) -> u8 {', '    if x { y }', '    1', '}', 'fn after() {', '}'].join('\n');
    expect(acceptFunctionSource(source)).toBe(['fn accept(x: u8) -> u8 {', '    if x { y }', '    1', '}'].join('\n'));
    expect(acceptFunctionSource('fn nothing() {\n}')).toBeNull();
  });

  it('compares the code after the header with the file and the published hash', async () => {
    const binary = Uint8Array.from([1, 2, 3, 4]);
    const account = new Uint8Array(45 + 4 + 10);
    account.set(binary, 45);
    const hash = await sha256Hex(binary);
    expect(await compareBinary(account, binary, hash)).toMatchObject({ match: true, onChain: hash, file: hash, bytes: 4 });
    const tampered = account.slice();
    tampered[46] = 9;
    expect((await compareBinary(tampered, binary, hash)).match).toBe(false);
    expect((await compareBinary(account, binary, 'ab')).match).toBe(false);
  });

  it('accepts a hash prefix of any stored length and nothing else', () => {
    expect(evidenceVerdict('abcd1234abcd1234', 'abcd1234abcd1234ffff')).toBe('match');
    expect(evidenceVerdict('abcd1234', 'abcd1234ffff')).toBe('match');
    expect(evidenceVerdict('abcd1235', 'abcd1234ffff')).toBe('no-match');
    expect(evidenceVerdict(null, 'abcd')).toBe('not-on-chain');
  });

  it('lists who signs each instruction from the IDL', () => {
    const idl = {
      instructions: [{ name: 'accept', accounts: [{ name: 'attester', signer: true }, { name: 'bounty' }, { name: 'claimant', signer: true }], checks: 'c' }],
    } as unknown as EscrowIdl;
    expect(instructionRows(idl)).toEqual([{ name: 'accept', signers: ['attester', 'claimant'], checks: 'c' }]);
  });

  it('prints the shell line that hashes only the evidence field', () => {
    expect(evidenceShellLine('https://x.supabase.co', 'W', 'html-skeleton')).toContain('jq -j .evidence | sha256sum');
  });
});
