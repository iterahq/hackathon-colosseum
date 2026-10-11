import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESCROW_LAYOUT, ESCROW_PROGRAM, ESCROW_STATE_BYTES } from '@/lib/chain/escrowAccount';

const read = (path: string) => readFileSync(path);
const idl = JSON.parse(read('public/verify/bounty-escrow.idl.json').toString('utf8'));

describe('what the site publishes about the escrow program', () => {
  it('serves the program source exactly as it is in the repository', () => {
    expect(read('public/verify/bounty-escrow.rs').equals(read('programs/bounty-escrow/src/lib.rs'))).toBe(true);
  });

  it('serves the binary whose hash the IDL states', () => {
    expect(createHash('sha256').update(read('public/verify/itera_bounty_escrow.so')).digest('hex')).toBe(idl.metadata.binary_sha256);
  });

  it('describes the program the source declares: same id, same errors, same attester', () => {
    const source = read('programs/bounty-escrow/src/lib.rs').toString('utf8');
    expect(idl.address).toBe(ESCROW_PROGRAM);
    expect(source).toContain(`declare_id!("${idl.address}")`);
    for (const error of idl.errors) expect(source).toContain(`${error.name} = ${error.code}`);
    expect(source).toContain(`ITERA_ATTESTER: Pubkey = pubkey!("${idl.constants[0].value}")`);
    for (const instruction of idl.instructions) expect(source).toContain(`${instruction.discriminator[0]} => ${instruction.name}(`);
  });

  it('describes the account layout the browser decoder reads', () => {
    expect(idl.accounts[0].size).toBe(ESCROW_STATE_BYTES);
    expect(idl.accounts[0].fields.map((field: { offset: number }) => field.offset)).toEqual(ESCROW_LAYOUT.map((entry) => entry.offset));
  });
});
