#!/usr/bin/env node
// The bounty escrow program on Solana devnet, called directly: what the PROGRAM refuses, whatever
// the Itera server would do. A claimant recorded without their own signature, someone else's
// certification, an account that is not a Core asset, a certification of another collection, an
// attester that is neither the approver nor Itera's, a payout signed by the attester, a payout to
// anyone but the recorded claimant, a second release, a refund after payment, a refund to anyone but
// the sponsor, a stranger's refund before the expiry. And what it allows without Itera: the claimant
// giving a bounty up with their own signature, anyone returning an expired bounty to its sponsor.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   node scripts/hackathon/bounty-program-e2e.mjs
//
// Environment: HACKATHON_TREASURY_KEYFILE (default ~/.config/itera-hackathon/devnet-treasury.json):
// Itera's attester key, which funds four throwaway bounties here. BOUNTY_ESCROW_PROGRAM: another
// deployment of the program. CLAIMANT_KEY and CERTIFICATION: the name of a wallet key under
// ~/.config/itera-hackathon/bounty-e2e-keys and its Itera certification asset; without them a fresh
// learner is signed in and stamped (needs SUPABASE_ACCESS_TOKEN, leaves a throwaway account).
//
// Refusals are simulated and cost nothing. About ten transactions are sent and four escrow rents stay
// on chain: about 0.012 SOL of the treasury, of which 0.002 goes to the claimant.
import { compileMessage, memoInstruction } from '../../supabase/functions/_shared/solana-message.ts';
import { buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { ESCROW_ERRORS, acceptInstruction, createInstruction, escrowPda, parseEscrowState, refundInstruction, releaseInstruction, unclaimInstruction } from '../../supabase/functions/_shared/bounty-program.ts';
import { balance, check, completeDays, done, explorer, latestBlockhash, loadTreasury, login, passport, rpc, send as sendMessage, sendBy, signedBy, sleep, wallet } from './bounty-e2e.lib.mjs';

const PROGRAM = process.env.BOUNTY_ESCROW_PROGRAM ?? 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
const PASSPORTS = 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b';
const MEDALS = '2frN2YFtKLWK4LCiqWMHppoGexSye9qk9xWue6ARsmDb';
const AMOUNT = 2_000_000n;
const expires = Math.floor(Date.now() / 1000) + 3600;

// Itera's attester: `ITERA_ATTESTER` in programs/bounty-escrow/src/lib.rs.
const treasury = loadTreasury();
// A key that is nobody to Itera: the outside sponsor of bounty Z, a stranger to the others.
const stranger = wallet('sponsor');
if ((await balance(stranger.address)) < 2_000_000) {
  await sendMessage(treasury, buildTransferMessage({ payer: treasury.address, recipient: stranger.address, lamports: 3_000_000n, memo: 'bounty-program-e2e: fee payer', recentBlockhash: await latestBlockhash() }));
}
const uncertified = wallet('b-uncertified');

/** A wallet with an Itera certification, and its key: the one named, or a fresh learner who completes day 1. */
async function certified() {
  if (process.env.CLAIMANT_KEY && process.env.CERTIFICATION) return { signer: wallet(process.env.CLAIMANT_KEY), certification: process.env.CERTIFICATION };
  const learner = await login(wallet(`program-claimant-${Date.now().toString(36)}`));
  await completeDays(learner.authUid, 1, 1);
  const minted = await passport(learner);
  const pass = [...(minted.j?.awards ?? []), ...(minted.j?.updated ?? [])].find((award) => award.key === 'trail_pass' && award.asset_address);
  if (!pass) throw new Error(`no certification minted: ${JSON.stringify(minted.j).slice(0, 200)}`);
  return { signer: learner, certification: pass.asset_address };
}

const message = async (payer, instructions) => compileMessage(payer.address, instructions, await latestBlockhash());
/** What the program answers to these instructions, without sending them: its refusal, or `ok`. Costs nothing. `signers[0]` pays. */
async function simulate(signers, instructions) {
  const { value } = await rpc('simulateTransaction', [signedBy(signers, await message(signers[0], instructions)), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }]);
  if (!value.err) return 'ok';
  const custom = value.err.InstructionError?.[1]?.Custom;
  return custom !== undefined ? (ESCROW_ERRORS[custom] ?? `custom_${custom}`) : JSON.stringify(value.err);
}
const send = async (signers, instructions) => sendBy(signers, await message(signers[0], instructions));
async function state(escrow) {
  const { value } = await rpc('getAccountInfo', [escrow, { encoding: 'base64', commitment: 'confirmed' }]);
  return value ? parseEscrowState(Uint8Array.from(Buffer.from(value.data[0], 'base64'))) : null;
}

const termsOf = (bountyId, overrides = {}) => ({ bountyId, sponsor: treasury.address, approver: treasury.address, collection: PASSPORTS, amount: AMOUNT, expiresAt: expires, ...overrides });
const create = (escrow, terms, funder = treasury.address) => createInstruction({ programId: PROGRAM, funder, escrow, ...terms });
const accept = (escrow, claimant, certification, attester = treasury.address) => acceptInstruction({ programId: PROGRAM, attester, escrow, claimant, certification });
const release = (escrow, claimant, approver = treasury.address) => releaseInstruction({ programId: PROGRAM, approver, escrow, claimant });
const unclaim = (escrow, authority = treasury.address) => unclaimInstruction({ programId: PROGRAM, authority, escrow });
const refund = (escrow, authority = treasury.address, sponsor = treasury.address) => refundInstruction({ programId: PROGRAM, authority, escrow, sponsor });

const { signer: claimant, certification } = await certified();
console.log(`program ${PROGRAM}\nattester ${treasury.address}\nclaimant ${claimant.address}\ncertification ${certification}`);

// --- Bounty X (Itera's own: approver = attester): the address, the gate, the claimant's signature, one release ---
const idX = crypto.randomUUID();
const X = await escrowPda(PROGRAM, termsOf(idX));
const past = termsOf(idX, { expiresAt: 1000 });
check('create in the past is refused', (await simulate([treasury], [create(await escrowPda(PROGRAM, past), past)])) === 'invalid_expiry');
check('create with terms the address was not derived from is refused', (await simulate([treasury], [create(X, termsOf(idX, { amount: 1n }))])) === 'wrong_escrow_account');
check('create by a stranger naming itself approver and sponsor is refused at that address', (await simulate([stranger], [create(X, termsOf(idX, { sponsor: stranger.address, approver: stranger.address }), stranger.address)])) !== 'ok');
console.log('  create', explorer('tx', await send([treasury], [create(X, termsOf(idX)), memoInstruction(`itera-bounty:${idX}:fund`)])), '\n  escrow account', X);
let account = await state(X);
check('the escrow account holds the bounty, open, with its terms', account?.status === 'open' && account.amount === AMOUNT && account.sponsor === treasury.address && account.collection === PASSPORTS && account.id === idX);
check('creating the same bounty twice is refused', (await simulate([treasury], [create(X, termsOf(idX))])) !== 'ok');

// The same accounts as `accept`, with the claimant NOT marked as a signer: what the server sent before learners signed.
const acceptWithoutClaimant = { programId: PROGRAM, accounts: [{ address: treasury.address, signer: true }, { address: X, writable: true }, { address: claimant.address }, { address: certification }], data: Uint8Array.of(1) };
check('PROGRAM refuses to record a claimant who did not sign, even from the attester', (await simulate([treasury], [acceptWithoutClaimant])) === 'claimant_must_sign');
check("PROGRAM refuses a wallet presenting someone else's certification", (await simulate([treasury, uncertified], [accept(X, uncertified.address, certification)])) === 'certification_not_owned_by_claimant');
check('PROGRAM refuses an account that is not a Core asset', (await simulate([treasury, uncertified], [accept(X, uncertified.address, treasury.address)])) === 'not_a_certification');
check('PROGRAM refuses a Core account that is not an asset (the collection itself)', (await simulate([treasury, uncertified], [accept(X, uncertified.address, PASSPORTS)])) === 'not_a_certification');
check('PROGRAM refuses an accept attested by a stranger, claimant signature or not', (await simulate([stranger, claimant], [accept(X, claimant.address, certification, stranger.address)])) === 'not_approver');
check('PROGRAM refuses a certified wallet accepting alone, with itself as attester', (await simulate([stranger, claimant], [accept(X, claimant.address, certification, claimant.address)])) === 'not_approver');
check('release before anyone accepted is refused', (await simulate([treasury], [release(X, claimant.address)])) === 'not_claimed');
const accepted = await send([treasury, claimant], [accept(X, claimant.address, certification), memoInstruction(`itera-bounty:${idX}:accept`)]);
console.log('  accept (signed by the claimant, fee paid by the attester)', explorer('tx', accepted));
const acceptTx = await rpc('getTransaction', [accepted, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
const acceptSigners = acceptTx.transaction.message.accountKeys.slice(0, acceptTx.transaction.message.header.numRequiredSignatures);
check('the accept transaction on chain carries the claimant among its signers, and the claimant paid no fee', acceptSigners.includes(claimant.address) && acceptSigners[0] === treasury.address);
account = await state(X);
check('claimed by the certified wallet, with the certification recorded', account?.status === 'claimed' && account.claimant === claimant.address && account.certification === certification);
check('a second accept is refused', (await simulate([treasury, claimant], [accept(X, claimant.address, certification)])) === 'not_open');
check('refund while claimed is refused', (await simulate([treasury], [refund(X)])) === 'not_open');
check('PROGRAM refuses an unclaim signed by a stranger', (await simulate([stranger], [unclaim(X, stranger.address)])) === 'not_authorized');

// Giving up: the claimant's own signature, nobody else's permission. The attester here only pays the fee.
const gaveUp = await send([treasury, claimant], [unclaim(X, claimant.address), memoInstruction(`itera-bounty:${idX}:withdraw`)]);
console.log('  unclaim (signed by the claimant)', explorer('tx', gaveUp));
account = await state(X);
check('after the claimant gave up the account is open and names nobody', account?.status === 'open' && account.claimant === null && account.certification === null);
check('unclaim of an open bounty is refused', (await simulate([treasury], [unclaim(X)])) === 'not_claimed');
check('PROGRAM refuses a release to the wallet that gave up', (await simulate([treasury], [release(X, claimant.address)])) === 'not_claimed');

await send([treasury, claimant], [accept(X, claimant.address, certification)]);
check('PROGRAM refuses to pay anyone but the recorded claimant', (await simulate([treasury], [release(X, uncertified.address)])) === 'wrong_claimant');
check('PROGRAM refuses a release signed by a stranger', (await simulate([stranger], [release(X, claimant.address, stranger.address)])) === 'not_approver');
const before = await balance(claimant.address);
console.log('  release', explorer('tx', await send([treasury], [release(X, claimant.address), memoInstruction(`itera-bounty:${idX}:payout`)])));
check('the claimant received exactly the amount', (await balance(claimant.address)) - before === Number(AMOUNT));
account = await state(X);
check('the escrow account says paid, and to whom', account?.status === 'paid' && account.claimant === claimant.address);
check('PROGRAM refuses a second release', (await simulate([treasury], [release(X, claimant.address)])) === 'not_claimed');
check('PROGRAM refuses a refund after payment', (await simulate([treasury], [refund(X)])) === 'not_open');
check('PROGRAM refuses the claimant unclaiming a paid bounty', (await simulate([treasury, claimant], [unclaim(X, claimant.address)])) === 'not_claimed');

// --- Bounty Y: another collection, refund -----------------------------------
const idY = crypto.randomUUID();
const termsY = termsOf(idY, { collection: MEDALS });
const Y = await escrowPda(PROGRAM, termsY);
await send([treasury], [create(Y, termsY)]);
check('PROGRAM refuses a certification of another collection', (await simulate([treasury, claimant], [accept(Y, claimant.address, certification)])) === 'certification_of_another_collection');
check('PROGRAM refuses a refund to anyone but the sponsor', (await simulate([treasury], [refund(Y, treasury.address, uncertified.address)])) === 'wrong_sponsor');
check('PROGRAM refuses a refund signed by a stranger before the expiry', (await simulate([stranger], [refund(Y, stranger.address)])) === 'not_authorized');
const refunded = await send([treasury], [refund(Y), memoInstruction(`itera-bounty:${idY}:refund`)]);
console.log('  refund', explorer('tx', refunded));
// Read from the transaction itself: the treasury's balance moves for other reasons while this runs.
const { meta, transaction } = await rpc('getTransaction', [refunded, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
const sponsorIndex = transaction.message.accountKeys.indexOf(treasury.address);
check('the sponsor got the amount back (minus the fee it paid for this transaction)', meta.postBalances[sponsorIndex] - meta.preBalances[sponsorIndex] === Number(AMOUNT) - meta.fee);
check('the escrow account says refunded', (await state(Y))?.status === 'refunded');
check('PROGRAM refuses a second refund', (await simulate([treasury], [refund(Y)])) === 'not_open');
check('PROGRAM refuses accept after a refund', (await simulate([treasury, claimant], [accept(Y, claimant.address, certification)])) === 'not_open');

// --- Bounty Z: an OUTSIDE sponsor (sponsor = approver = a wallet that is not Itera's). Itera's key attests, and can move nothing ---
const idZ = crypto.randomUUID();
const termsZ = termsOf(idZ, { sponsor: stranger.address, approver: stranger.address });
const Z = await escrowPda(PROGRAM, termsZ);
await send([treasury], [create(Z, termsZ)]);
check("on an outside sponsor's bounty, Itera's attester cannot refund before the expiry", (await simulate([treasury], [refund(Z, treasury.address, stranger.address)])) === 'not_authorized');
check("on an outside sponsor's bounty, Itera's attester cannot send the refund to itself", (await simulate([stranger], [refund(Z, stranger.address, treasury.address)])) === 'wrong_sponsor');
console.log('  accept on the outside bounty, attested by Itera', explorer('tx', await send([treasury, claimant], [accept(Z, claimant.address, certification)])));
check('the outside bounty is held by the claimant', (await state(Z))?.status === 'claimed');
check("on an outside sponsor's bounty, Itera's attester cannot release", (await simulate([treasury], [release(Z, claimant.address)])) === 'not_approver');
check("Itera's attester may reopen a claim (a hold that timed out), and only that", (await simulate([treasury], [unclaim(Z)])) === 'ok');
check('the sponsor (approver) may reopen it too', (await simulate([stranger], [unclaim(Z, stranger.address)])) === 'ok');
const beforeZ = await balance(claimant.address);
console.log('  release signed by the outside sponsor', explorer('tx', await send([stranger], [release(Z, claimant.address, stranger.address)])));
check("the outside sponsor's own signature paid the claimant", (await balance(claimant.address)) - beforeZ === Number(AMOUNT) && (await state(Z))?.status === 'paid');

// --- Bounty W: past its expiry, anyone returns the money to the sponsor ------
const idW = crypto.randomUUID();
const termsW = termsOf(idW, { expiresAt: Math.floor(Date.now() / 1000) + 25 });
const W = await escrowPda(PROGRAM, termsW);
await send([treasury], [create(W, termsW)]);
check('before the expiry a stranger cannot refund', (await simulate([stranger], [refund(W, stranger.address)])) === 'not_authorized');
for (let waited = 0; waited < 90 && (await simulate([treasury, claimant], [accept(W, claimant.address, certification)])) !== 'expired'; waited += 5) await sleep(5000);
check('PROGRAM refuses accept past the expiry', (await simulate([treasury, claimant], [accept(W, claimant.address, certification)])) === 'expired');
check('past the expiry a stranger still cannot choose the destination', (await simulate([stranger], [refund(W, stranger.address, stranger.address)])) === 'wrong_sponsor');
const swept = await send([stranger], [refund(W, stranger.address)]);
console.log('  refund of an expired bounty, signed by a stranger', explorer('tx', swept));
const sweptTx = await rpc('getTransaction', [swept, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
const sponsorAt = sweptTx.transaction.message.accountKeys.indexOf(treasury.address);
check('the money went to the recorded sponsor, whoever signed', sweptTx.meta.postBalances[sponsorAt] - sweptTx.meta.preBalances[sponsorAt] === Number(AMOUNT) && (await state(W))?.status === 'refunded');
console.log(JSON.stringify({ X, Y, Z, W }));
done();
