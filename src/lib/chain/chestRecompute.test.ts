import { describe, expect, it } from 'vitest';
import sample from './chestSample.fixture.json';
import { recomputeFromChain, type ChestChain, type ChestClaim } from './chestRecompute';

// A real chest of devnet (a team test wallet), as `tera-chest/<id>` answered it on 2026-10-12.
const { chest, recompute } = sample;
const claim: ChestClaim = { certification: chest.certification, day: chest.day, commitTx: chest.commit.tx, teraKey: chest.tera.key, tier: chest.tier, poolDocument: recompute.pool_document, unavailable: recompute.unavailable };

const borsh = (text: string): number[] => {
  const bytes = [...new TextEncoder().encode(text)];
  return [bytes.length & 0xff, (bytes.length >>> 8) & 0xff, 0, 0, ...bytes];
};
/** Instruction data that writes `chest:<day>` = value, as the stamp transaction carries it. */
const writes = (day: number, value: string) => new Uint8Array([9, 9, ...borsh(`chest:${day}`), ...borsh(value), 1]);

const chain = (over: Partial<ChestChain> = {}): ChestChain => ({
  attributes: async () => [{ key: 'kind', value: 'certification' }, { key: `chest:${chest.day}`, value: chest.commit.value }],
  transaction: async () => ({ slot: chest.commit.tx_slot, failed: false, data: [new Uint8Array([1, 2, 3]), writes(chest.day, chest.commit.value)] }),
  firstBlock: async (from) => (from === chest.commit.slot ? { slot: chest.seed.slot, blockhash: chest.seed.blockhash } : null),
  ...over,
});

describe('recomputeFromChain', () => {
  it('rolls the real chest again from its chain inputs and gets the Tera it gave', async () => {
    const outcome = await recomputeFromChain(claim, chain());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({ commit: chest.commit.value, targetSlot: chest.commit.slot, level: chest.level, commitTxSlot: chest.commit.tx_slot, seedSlot: chest.seed.slot, seed: chest.seed.value, tier: chest.tier, key: chest.tera.key, agrees: true });
    expect(outcome.result.steps).toEqual(recompute.steps);
  });

  it('another block gives another seed, and the chest no longer agrees', async () => {
    const outcome = await recomputeFromChain(claim, chain({ firstBlock: async () => ({ slot: chest.seed.slot + 1, blockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi' }) }));
    expect(outcome.ok && outcome.result.seed).not.toBe(chest.seed.value);
    expect(outcome.ok && outcome.result.agrees).toBe(false);
  });

  it('says so when a chest claims a Tera the roll does not give', async () => {
    const outcome = await recomputeFromChain({ ...claim, teraKey: 'brand_phoenix_full' }, chain());
    expect(outcome.ok && outcome.result.agrees).toBe(false);
  });

  it('refuses a seal written at or after the slot it names', async () => {
    const late = await recomputeFromChain(claim, chain({ transaction: async () => ({ slot: chest.commit.slot, failed: false, data: [writes(chest.day, chest.commit.value)] }) }));
    expect(late).toEqual({ ok: false, error: 'commit_late' });
  });

  it('refuses a transaction that did not write the seal, a failed one and a missing one', async () => {
    expect(await recomputeFromChain(claim, chain({ transaction: async () => ({ slot: chest.commit.tx_slot, failed: false, data: [writes(chest.day, '1.0.00000000')] }) }))).toEqual({ ok: false, error: 'commit_not_in_tx' });
    expect(await recomputeFromChain(claim, chain({ transaction: async () => ({ slot: chest.commit.tx_slot, failed: true, data: [] }) }))).toEqual({ ok: false, error: 'no_commit_tx' });
    expect(await recomputeFromChain(claim, chain({ transaction: async () => null }))).toEqual({ ok: false, error: 'no_commit_tx' });
  });

  it('refuses a pool that is not the one the seal names', async () => {
    const swapped = recompute.pool_document.replace('rarity_comum', 'rarity_comun');
    expect(await recomputeFromChain({ ...claim, poolDocument: swapped }, chain())).toEqual({ ok: false, error: 'pool_mismatch' });
  });

  it('names what is missing on chain: the certification, the seal of that day, the block', async () => {
    expect(await recomputeFromChain(claim, chain({ attributes: async () => null }))).toEqual({ ok: false, error: 'no_certification' });
    expect(await recomputeFromChain(claim, chain({ attributes: async () => [{ key: 'chest:9', value: chest.commit.value }] }))).toEqual({ ok: false, error: 'no_commitment' });
    expect(await recomputeFromChain(claim, chain({ firstBlock: async () => null }))).toEqual({ ok: false, error: 'no_block' });
  });
});
