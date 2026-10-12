/**
 * Rolls a day chest again in the visitor's browser. The chain inputs are read from a public Solana node; the
 * roll itself is the SAME file the server runs (`_shared/tera-roll.ts`). What comes from Itera's tables is
 * named as such, and the one of them that decides anything (the pool) is checked against a hash on chain.
 */
import { CHEST_BLOCK_WINDOW, commitLandedInTime, instructionCommits, onchainChests, parseCommit, recomputeChest } from '../../../supabase/functions/_shared/tera-roll';
import { base58Bytes } from '../../../supabase/functions/_shared/solana-tx';
import { parseCoreAsset } from '@/lib/chain/coreAsset';
import { readAccount, rpcCall, transactionParams } from '@/lib/chain/rpc';

/** What Itera's public read gives for one chest: the only inputs that do not come from the chain. */
export interface ChestClaim {
  certification: string;
  day: number;
  commitTx: string;
  /** The Tera the chest says it gave. */
  teraKey: string | null;
  tier: string | null;
  poolDocument: string;
  unavailable: string[];
}

export type RecomputeFailure = 'no_certification' | 'no_commitment' | 'no_commit_tx' | 'commit_late' | 'commit_not_in_tx' | 'no_block' | 'bad_commit' | 'bad_pool' | 'pool_mismatch';

export interface ChestRecomputed {
  /** `chest:<day>` as the certification asset holds it now. */
  commit: string;
  targetSlot: number;
  level: number;
  commitTxSlot: number;
  seedSlot: number;
  blockhash: string;
  seed: string;
  tier: string;
  key: string;
  steps: string[];
  /** The recomputed Tera is the one the chest says it gave. */
  agrees: boolean;
}

export type RecomputeOutcome = { ok: true; result: ChestRecomputed } | { ok: false; error: RecomputeFailure };

interface TxWire {
  slot: number;
  transaction: { message: { instructions: Array<{ data: string }> } };
  meta: { err: unknown; innerInstructions?: Array<{ instructions: Array<{ data: string }> }> } | null;
}

/** The node calls a recompute makes, so a test can answer them without a network. */
export interface ChestChain {
  attributes: (asset: string) => Promise<Array<{ key: string; value: string }> | null>;
  transaction: (signature: string) => Promise<{ slot: number; failed: boolean; data: Uint8Array[] } | null>;
  firstBlock: (fromSlot: number) => Promise<{ slot: number; blockhash: string } | null>;
}

export const PUBLIC_CHAIN: ChestChain = {
  async attributes(asset) {
    const account = await readAccount(asset);
    return account ? (parseCoreAsset(account.data)?.attributes ?? null) : null;
  },
  async transaction(signature) {
    const tx = await rpcCall<TxWire | null>('getTransaction', transactionParams(signature));
    if (!tx) return null;
    const inner = (tx.meta?.innerInstructions ?? []).flatMap((group) => group.instructions);
    const data = [...tx.transaction.message.instructions, ...inner].map((instruction) => base58Bytes(instruction.data)).filter((bytes): bytes is Uint8Array => bytes !== null);
    return { slot: tx.slot, failed: Boolean(tx.meta?.err), data };
  },
  async firstBlock(fromSlot) {
    const slots = await rpcCall<number[]>('getBlocks', [fromSlot, fromSlot + CHEST_BLOCK_WINDOW, { commitment: 'confirmed' }]);
    if (!slots?.length) return null;
    const block = await rpcCall<{ blockhash: string } | null>('getBlock', [slots[0], { commitment: 'confirmed', transactionDetails: 'none', rewards: false, maxSupportedTransactionVersion: 0 }]);
    return block ? { slot: slots[0], blockhash: block.blockhash } : null;
  },
};

/** Every step a stranger would do by hand, in order; the first one that does not hold is the answer. */
export async function recomputeFromChain(claim: ChestClaim, chain: ChestChain = PUBLIC_CHAIN): Promise<RecomputeOutcome> {
  const attributes = await chain.attributes(claim.certification);
  if (!attributes) return { ok: false, error: 'no_certification' };
  const commit = onchainChests(attributes).get(claim.day);
  const parsed = parseCommit(commit);
  if (!commit || !parsed) return { ok: false, error: 'no_commitment' };
  const tx = await chain.transaction(claim.commitTx);
  if (!tx || tx.failed) return { ok: false, error: 'no_commit_tx' };
  if (!commitLandedInTime(tx.slot, parsed)) return { ok: false, error: 'commit_late' };
  if (!tx.data.some((data) => instructionCommits(data, claim.day, commit))) return { ok: false, error: 'commit_not_in_tx' };
  const block = await chain.firstBlock(parsed.slot);
  if (!block) return { ok: false, error: 'no_block' };
  const roll = recomputeChest({ blockhash: block.blockhash, certification: claim.certification, day: claim.day, commit, poolDocument: claim.poolDocument, unavailable: claim.unavailable });
  if ('error' in roll) return { ok: false, error: roll.error };
  return {
    ok: true,
    result: { commit, targetSlot: parsed.slot, level: parsed.level, commitTxSlot: tx.slot, seedSlot: block.slot, blockhash: block.blockhash, seed: roll.seed, tier: roll.tier ?? '', key: roll.key ?? '', steps: roll.steps, agrees: Boolean(roll.key) && roll.key === claim.teraKey },
  };
}
