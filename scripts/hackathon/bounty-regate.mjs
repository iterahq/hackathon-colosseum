#!/usr/bin/env node
// Moves the reward of every OPEN bounty of the team from its 195-byte escrow account to a gated one (228 bytes):
// the old account refunds the treasury, a new account whose terms name the trail and the stamped days is funded
// with the same reward, and the bounty row follows. A bounty someone holds, delivered or paid is left alone.
// Needs the gated program live (`bounty_escrow_version` 3). Idempotent: a bounty already gated is skipped.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   node scripts/hackathon/bounty-regate.mjs            (dry run: lists what it would move)
//   node scripts/hackathon/bounty-regate.mjs --apply
import { compileMessage, memoInstruction } from '../../supabase/functions/_shared/solana-message.ts';
import { createInstruction, escrowPda, parseEscrowState, refundInstruction, trailHash } from '../../supabase/functions/_shared/bounty-program.ts';
import { explorer, latestBlockhash, loadTreasury, rpc, sendBy, sql } from './bounty-e2e.lib.mjs';

const apply = process.argv.includes('--apply');
const treasury = loadTreasury();
const config = Object.fromEntries((await sql("select key, value from itera.onchain_config where key in ('bounty_escrow_program','bounty_escrow_version','collection_passports')")).map((row) => [row.key, row.value]));
if (Number(config.bounty_escrow_version) < 3) throw new Error('the gated program is not live (bounty_escrow_version < 3)');
const program = config.bounty_escrow_program;
const rows = await sql("select id, slug, escrow_address, reward_lamports, requirement, floor(extract(epoch from expires_at))::bigint as expires from itera.bounties where status = 'open' and origin = 'team' and escrow_kind = 'program' and not escrow_gated and claim_id is null and is_test = false and expires_at > now() + interval '1 hour' order by created_at");
const state = async (address) => {
  const { value } = await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
  return value ? parseEscrowState(Uint8Array.from(Buffer.from(value.data[0], 'base64'))) : null;
};
const send = async (instructions) => sendBy([treasury], compileMessage(treasury.address, instructions, await latestBlockhash()));

for (const row of rows) {
  const old = await state(row.escrow_address);
  if (old?.status !== 'open' || old.sponsor !== treasury.address || old.approver !== treasury.address) {
    console.log(`skip  ${row.slug}: the account is ${old?.status ?? 'missing'} or not the treasury's`);
    continue;
  }
  const gate = { minDays: row.requirement.min_days, trail: await trailHash(row.requirement.program, row.requirement.trail) };
  const terms = { bountyId: row.id, sponsor: treasury.address, approver: treasury.address, collection: config.collection_passports, amount: BigInt(row.reward_lamports), expiresAt: Number(row.expires), gate };
  const gated = await escrowPda(program, terms);
  console.log(`${apply ? 'move ' : 'would'} ${row.slug}: ${row.escrow_address} -> ${gated} (${gate.minDays} day(s) of ${row.requirement.trail})`);
  if (!apply) continue;
  const refunded = await send([refundInstruction({ programId: program, authority: treasury.address, escrow: row.escrow_address, sponsor: treasury.address }), memoInstruction(`itera-bounty:${row.id}:refund`)]);
  const funded = await send([createInstruction({ programId: program, funder: treasury.address, escrow: gated, ...terms }), memoInstruction(`itera-bounty:${row.id}:fund`)]);
  const after = await state(gated);
  if (after?.status !== 'open' || after.gate?.minDays !== gate.minDays) throw new Error(`the gated account of ${row.slug} is not open: stop and look`);
  const moved = await sql(`with moved as (
      update itera.bounties set escrow_address = '${gated}', escrow_gated = true, funded_at = now(), funding_signature = '${funded}', updated_at = now()
       where id = '${row.id}' and status = 'open' and claim_id is null and escrow_address = '${row.escrow_address}' returning id)
    insert into itera.bounty_events (bounty_id, kind, wallet, lamports, signature, signer)
    select id, kind, '${treasury.address}', ${Number(row.reward_lamports)}, signature, '${treasury.address}' from moved,
      (values (1, 'escrow_moved', '${refunded}'), (2, 'funded', '${funded}')) as step(position, kind, signature) order by position returning kind`);
  console.log(`  refund ${explorer('tx', refunded)}\n  fund   ${explorer('tx', funded)}\n  rows   ${JSON.stringify(moved)}`);
}
console.log(`${rows.length} open team bounties without a gate${apply ? ' handled' : ' (dry run)'}`);
