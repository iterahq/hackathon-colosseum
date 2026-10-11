#!/usr/bin/env node
// The bounty escrow program on Solana devnet, called directly: what the PROGRAM refuses, whatever
// the Itera server would do. Someone else's certification, an account that is not a Core asset, a
// certification of another collection, a signer that is not the approver, a payout to anyone but the
// recorded claimant, a second release, a refund after payment, a refund to anyone but the sponsor.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   node scripts/hackathon/bounty-program-e2e.mjs
//
// Environment: HACKATHON_TREASURY_KEYFILE (default ~/.config/itera-hackathon/devnet-treasury.json):
// the key that acts as funder, sponsor and approver of two throwaway bounties. SUPABASE_ACCESS_TOKEN
// only when no certified wallet is given: CLAIMANT and CERTIFICATION (a wallet and its Itera
// certification asset) skip the mint.
//
// Refusals are simulated and cost nothing. Four transactions are sent (create, accept, release,
// refund) and two escrow rents stay on chain: about 0.006 SOL of the treasury, of which 0.002 goes
// to the claimant.
import { compileMessage, memoInstruction } from '../../supabase/functions/_shared/solana-message.ts';
import { buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { ESCROW_ERRORS, acceptInstruction, createInstruction, escrowPda, parseEscrowState, refundInstruction, releaseInstruction, unclaimInstruction } from '../../supabase/functions/_shared/bounty-program.ts';
import { balance, check, completeDays, done, explorer, latestBlockhash, loadTreasury, login, passport, rpc, send as sendMessage, signed, wallet } from './bounty-e2e.lib.mjs';

const PROGRAM = process.env.BOUNTY_ESCROW_PROGRAM ?? 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
const PASSPORTS = 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b';
const MEDALS = '2frN2YFtKLWK4LCiqWMHppoGexSye9qk9xWue6ARsmDb';
const AMOUNT = 2_000_000n;
const expires = Math.floor(Date.now() / 1000) + 3600;

const treasury = loadTreasury();
// A key that is nobody to the bounties below. It only needs lamports to be a fee payer in the simulations.
const stranger = wallet('sponsor');
if ((await balance(stranger.address)) < 2_000_000) {
  await sendMessage(treasury, buildTransferMessage({ payer: treasury.address, recipient: stranger.address, lamports: 3_000_000n, memo: 'bounty-program-e2e: fee payer', recentBlockhash: await latestBlockhash() }));
}
const uncertified = wallet('b-uncertified').address;

/** A wallet with an Itera certification: the one given, or a fresh learner who completes day 1. */
async function certified() {
  if (process.env.CLAIMANT && process.env.CERTIFICATION) return { wallet: process.env.CLAIMANT, certification: process.env.CERTIFICATION };
  const learner = await login(wallet(`program-claimant-${Date.now().toString(36)}`));
  await completeDays(learner.authUid, 1, 1);
  const minted = await passport(learner);
  const pass = [...(minted.j?.awards ?? []), ...(minted.j?.updated ?? [])].find((award) => award.key === 'trail_pass' && award.asset_address);
  if (!pass) throw new Error(`no certification minted: ${JSON.stringify(minted.j).slice(0, 200)}`);
  return { wallet: learner.address, certification: pass.asset_address };
}

const message = async (signer, instructions) => compileMessage(signer.address, instructions, await latestBlockhash());
/** What the program answers to these instructions, without sending them: its refusal, or `ok`. Costs nothing. */
async function simulate(signer, instructions) {
  const { value } = await rpc('simulateTransaction', [signed(signer, await message(signer, instructions)), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }]);
  if (!value.err) return 'ok';
  const custom = value.err.InstructionError?.[1]?.Custom;
  return custom !== undefined ? (ESCROW_ERRORS[custom] ?? `custom_${custom}`) : JSON.stringify(value.err);
}
const send = async (signer, instructions) => sendMessage(signer, await message(signer, instructions));
async function state(escrow) {
  const { value } = await rpc('getAccountInfo', [escrow, { encoding: 'base64', commitment: 'confirmed' }]);
  return value ? parseEscrowState(Uint8Array.from(Buffer.from(value.data[0], 'base64'))) : null;
}

const termsOf = (bountyId, collection = PASSPORTS) => ({ bountyId, sponsor: treasury.address, approver: treasury.address, collection, amount: AMOUNT, expiresAt: expires });
const create = (escrow, terms, funder = treasury.address) => createInstruction({ programId: PROGRAM, funder, escrow, ...terms });
const party = { programId: PROGRAM, approver: treasury.address };
const refund = (escrow, authority = treasury.address, sponsor = treasury.address) => refundInstruction({ programId: PROGRAM, authority, escrow, sponsor });

const claimant = await certified();
console.log(`program ${PROGRAM}\napprover ${treasury.address}\nclaimant ${claimant.wallet}\ncertification ${claimant.certification}`);

// --- Bounty X: the address, the gate, one release ----------------------------
const idX = crypto.randomUUID();
const X = await escrowPda(PROGRAM, termsOf(idX));
const past = { ...termsOf(idX), expiresAt: 1000 };
check('create in the past is refused', (await simulate(treasury, [create(await escrowPda(PROGRAM, past), past)])) === 'invalid_expiry');
check('create with terms the address was not derived from is refused', (await simulate(treasury, [create(X, { ...termsOf(idX), amount: 1n })])) === 'wrong_escrow_account');
check('create by a stranger naming itself approver and sponsor is refused at that address', (await simulate(stranger, [create(X, { ...termsOf(idX), sponsor: stranger.address, approver: stranger.address }, stranger.address)])) !== 'ok');
console.log('  create', explorer('tx', await send(treasury, [create(X, termsOf(idX)), memoInstruction(`itera-bounty:${idX}:fund`)])), '\n  escrow account', X);
let account = await state(X);
check('the escrow account holds the bounty, open, with its terms', account?.status === 'open' && account.amount === AMOUNT && account.sponsor === treasury.address && account.collection === PASSPORTS && account.id === idX);
check('creating the same bounty twice is refused', (await simulate(treasury, [create(X, termsOf(idX))])) !== 'ok');

const accept = (wallet, certification, approver = treasury.address) => acceptInstruction({ programId: PROGRAM, approver, escrow: X, claimant: wallet, certification });
check("PROGRAM refuses a wallet presenting someone else's certification", (await simulate(treasury, [accept(uncertified, claimant.certification)])) === 'certification_not_owned_by_claimant');
check('PROGRAM refuses an account that is not a Core asset', (await simulate(treasury, [accept(uncertified, treasury.address)])) === 'not_a_certification');
check('PROGRAM refuses a Core account that is not an asset (the collection itself)', (await simulate(treasury, [accept(uncertified, PASSPORTS)])) === 'not_a_certification');
check('PROGRAM refuses accept signed by anyone but the approver', (await simulate(stranger, [accept(claimant.wallet, claimant.certification, stranger.address)])) === 'not_approver');
check('release before anyone accepted is refused', (await simulate(treasury, [releaseInstruction({ ...party, escrow: X, claimant: claimant.wallet })])) === 'not_claimed');
console.log('  accept', explorer('tx', await send(treasury, [accept(claimant.wallet, claimant.certification)])));
account = await state(X);
check('claimed by the certified wallet, with the certification recorded', account?.status === 'claimed' && account.claimant === claimant.wallet && account.certification === claimant.certification);
check('a second accept is refused', (await simulate(treasury, [accept(claimant.wallet, claimant.certification)])) === 'not_open');
check('refund while claimed is refused', (await simulate(treasury, [refund(X)])) === 'not_open');
check('PROGRAM refuses to pay anyone but the recorded claimant', (await simulate(treasury, [releaseInstruction({ ...party, escrow: X, claimant: uncertified })])) === 'wrong_claimant');
check('PROGRAM refuses a release signed by a stranger', (await simulate(stranger, [releaseInstruction({ programId: PROGRAM, approver: stranger.address, escrow: X, claimant: claimant.wallet })])) === 'not_approver');
const before = await balance(claimant.wallet);
console.log('  release', explorer('tx', await send(treasury, [releaseInstruction({ ...party, escrow: X, claimant: claimant.wallet }), memoInstruction(`itera-bounty:${idX}:payout`)])));
check('the claimant received exactly the amount', (await balance(claimant.wallet)) - before === Number(AMOUNT));
account = await state(X);
check('the escrow account says paid, and to whom', account?.status === 'paid' && account.claimant === claimant.wallet);
check('PROGRAM refuses a second release', (await simulate(treasury, [releaseInstruction({ ...party, escrow: X, claimant: claimant.wallet })])) === 'not_claimed');
check('PROGRAM refuses a refund after payment', (await simulate(treasury, [refund(X)])) === 'not_open');

// --- Bounty Y: another collection, unclaim, refund ---------------------------
const idY = crypto.randomUUID();
const Y = await escrowPda(PROGRAM, termsOf(idY, MEDALS));
await send(treasury, [create(Y, termsOf(idY, MEDALS))]);
check('PROGRAM refuses a certification of another collection', (await simulate(treasury, [acceptInstruction({ ...party, escrow: Y, claimant: claimant.wallet, certification: claimant.certification })])) === 'certification_of_another_collection');
check('PROGRAM refuses a refund to anyone but the sponsor', (await simulate(treasury, [refund(Y, treasury.address, uncertified)])) === 'wrong_sponsor');
check('PROGRAM refuses a refund signed by a stranger', (await simulate(stranger, [refund(Y, stranger.address)])) === 'not_authorized');
check('unclaim of an open bounty is refused', (await simulate(treasury, [unclaimInstruction({ ...party, escrow: Y })])) === 'not_claimed');
const refunded = await send(treasury, [refund(Y), memoInstruction(`itera-bounty:${idY}:refund`)]);
console.log('  refund', explorer('tx', refunded));
// Read from the transaction itself: the treasury's balance moves for other reasons while this runs.
const { meta, transaction } = await rpc('getTransaction', [refunded, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
const sponsorIndex = transaction.message.accountKeys.indexOf(treasury.address);
check('the sponsor got the amount back (minus the fee it paid for this transaction)', meta.postBalances[sponsorIndex] - meta.preBalances[sponsorIndex] === Number(AMOUNT) - meta.fee);
check('the escrow account says refunded', (await state(Y))?.status === 'refunded');
check('PROGRAM refuses a second refund', (await simulate(treasury, [refund(Y)])) === 'not_open');
check('PROGRAM refuses accept after a refund', (await simulate(treasury, [acceptInstruction({ ...party, escrow: Y, claimant: claimant.wallet, certification: claimant.certification })])) === 'not_open');
console.log(JSON.stringify({ X, Y }));
done();
