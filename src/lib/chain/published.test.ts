import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PUBLISHED_RECORD } from '@/lib/chain/verifyChecks';
import { ESCROW_LAYOUT, ESCROW_PROGRAM, ESCROW_STATE_BYTES, GATED_ESCROW_LAYOUT, GATED_ESCROW_STATE_BYTES } from '@/lib/chain/escrowAccount';

const read = (path: string) => readFileSync(path);
const idl = JSON.parse(read('public/verify/bounty-escrow.idl.json').toString('utf8'));

describe('what the site publishes about the escrow program', () => {
  it('serves the program source exactly as it is in the repository', () => {
    expect(read('public/verify/bounty-escrow.rs').equals(read('programs/bounty-escrow/src/lib.rs'))).toBe(true);
  });

  it('serves the three files whose hashes the authority wrote on Solana (a changed file needs a new record)', () => {
    for (const file of PUBLISHED_RECORD.files) expect(createHash('sha256').update(read(`public${file.path}`)).digest('hex')).toBe(file.sha256);
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
    expect(idl.accounts[1].name).toBe('GatedBounty');
    expect(idl.accounts[1].size).toBe(GATED_ESCROW_STATE_BYTES);
    expect(idl.accounts[1].fields.map((field: { offset: number }) => field.offset)).toEqual(GATED_ESCROW_LAYOUT.map((entry) => entry.offset));
    expect(idl.instructions.map((instruction: { name: string }) => instruction.name)).toContain('create_gated');
  });
});
