#!/usr/bin/env node
// The page and the chain, compared at every step of a bounty: funded, accepted, given up, accepted
// again, delivered, rejected, delivered again, approved and paid, then a second bounty accepted, out of
// time, refunded. After each step the public page (`bounty-board/<slug>`) and the escrow account read
// straight from a Solana node must tell the same story: same status, same wallet. And each step that
// is on chain must be signed by who the page says signed it: accept and give-up by the LEARNER's
// wallet (which pays no fee), the rest by Itera's key.
//
// Also what the server refuses when the learner sends back something other than the transaction it
// offered: another signature, an extra transfer out of the fee payer, the old unsigned accept.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   RUN=<label of an earlier bounty-e2e run> node scripts/hackathon/bounty-chain-agrees.mjs
//
// RUN names a learner wallet a-<RUN> under ~/.config/itera-hackathon/bounty-e2e-keys that already holds
// a certification with two stamped days of Week 1; without it a fresh one is signed in and stamped.
// The sponsor wallet is an instructor of the DevFellowship tenant; its bounties here are `is_test`.
// One row is touched by SQL: the deadline of this run's own test claim is moved to the past, to see
// the expiry. Costs the treasury two escrow rents and about a dozen fees (about 0.01 SOL).
import { compileMessage, decodeMessage } from '../../supabase/functions/_shared/solana-message.ts';
import { parseEscrowState } from '../../supabase/functions/_shared/bounty-program.ts';
import { SYSTEM_PROGRAM, base64Encode, transferData } from '../../supabase/functions/_shared/solana-tx.ts';
import { acceptBounty, call, check, completeDays, done, explorer, get, login, passport, rpc, signatureOf, signedStep, sleep, sql, wallet, withdrawBounty } from './bounty-e2e.lib.mjs';

const UNIT = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const REWARD = 2_000_000;
const stamp = Date.now().toString(36);
const RUN = process.env.RUN ?? stamp;

const sponsor = await login(wallet('sponsor'));
const learner = await login(wallet(`a-${RUN}`));
let mine = await call('bounty-claim', learner, { action: 'status', bounty: UNIT });
console.log('sponsor', sponsor.address, '\nlearner', learner.address);

const form = (slug) => ({
  action: 'create', slug, sponsor_name: 'E2E Sponsor',
  title: { pt: `Teste página x chain ${slug}`, en: `Page vs chain test ${slug}` },
  summary: { pt: 'Missão de teste automatizado.', en: 'Automated test bounty.' },
  brief: { pt: 'Tarefa de teste: a página e a conta de escrow têm de concordar.', en: 'Test task: the page and the escrow account must agree.' },
  deliverable: { pt: 'Um link https', en: 'An https link' },
  reward_lamports: REWARD, unit_id: UNIT, min_days: 2, expires_in_days: 1,
});
async function post(slug) {
  const created = await call('bounty-sponsor', sponsor, form(slug));
  if (!created.j?.id) throw new Error(`bounty not created: ${JSON.stringify(created.j)}`);
  await sql(`update itera.bounties set is_test = true where id = '${created.j.id}'`);
  const funded = await call('bounty-sponsor', sponsor, { action: 'fund', bounty: created.j.id });
  if (funded.j?.status !== 'open') throw new Error(`bounty not funded: ${JSON.stringify(funded.j)}`);
  return created.j.id;
}

const PAGE_TO_CHAIN = { open: 'open', expired: 'open', claimed: 'claimed', submitted: 'claimed', paying: 'claimed', paid: 'paid', refunded: 'refunded' };
/** Reads the page and the account, and checks they agree. Answers both. */
async function agree(step, slug, expected) {
  const page = (await get(`bounty-board/${slug}`)).j;
  const info = (await rpc('getAccountInfo', [page.escrow.address, { encoding: 'base64', commitment: 'confirmed' }])).value;
  const account = info ? parseEscrowState(Uint8Array.from(Buffer.from(info.data[0], 'base64'))) : null;
  const holder = page.status === 'paid' ? page.payout?.wallet : (page.claim?.wallet ?? null);
  const same = account?.status === PAGE_TO_CHAIN[page.status] && (account.claimant ?? null) === (holder ?? null) && info.owner === page.escrow.program_id;
  check(`${step}: page says ${page.status}${holder ? ` (${holder.slice(0, 4)}…)` : ''}, account says ${account?.status}${account?.claimant ? ` (${account.claimant.slice(0, 4)}…)` : ''}`, same && page.status === expected.status && (holder ?? null) === (expected.holder ?? null));
  return { page, account };
}
/** The signers of a transaction, as the node has it. The first one paid the fee. */
async function signersOf(signature) {
  const tx = await rpc('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  return tx.transaction.message.accountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures);
}
const lastEvent = (page, kind) => page.events.filter((event) => event.kind === kind).at(-1);
/** A step the page says the learner signed: the transaction must carry their signature, and the fee payer must be someone else. */
async function learnerSigned(step, page, kind) {
  const event = lastEvent(page, kind);
  const signers = event?.signature ? await signersOf(event.signature) : [];
  check(`${step}: the ledger row has a transaction, says the learner signed it, and the chain agrees (fee paid by ${signers[0]?.slice(0, 4)}…)`, Boolean(event?.signature) && event.signed_by === learner.address && signers.includes(learner.address) && signers[0] !== learner.address, event?.explorer_url ?? 'no transaction');
  if (event?.signature) console.log(`  ${kind}`, explorer('tx', event.signature));
}
async function iteraSigned(step, page, kind) {
  const event = lastEvent(page, kind);
  const signers = event?.signature ? await signersOf(event.signature) : [];
  check(`${step}: the ledger row has a transaction signed by Itera's key alone, and says so`, Boolean(event?.signature) && signers.length === 1 && event.signed_by === signers[0] && event.signed_by !== learner.address, event?.explorer_url ?? 'no transaction');
  if (event?.signature) console.log(`  ${kind}`, explorer('tx', event.signature));
}

// --- Bounty 1: accept, give up, accept, deliver, reject, deliver, approve ----
const slug1 = `e2e-agree-${stamp}`;
const id1 = await post(slug1);
mine = await call('bounty-claim', learner, { action: 'status', bounty: id1 });
if (!mine.j.eligible) {
  await completeDays(learner.authUid, 1, 2);
  await passport(learner);
  mine = await call('bounty-claim', learner, { action: 'status', bounty: id1 });
}
check('the learner is eligible, read from chain', mine.j.eligible === true, JSON.stringify(mine.j).slice(0, 200));
await agree('funded', slug1, { status: 'open' });

// What the server refuses to co-sign.
check('the old unsigned accept is refused', (await call('bounty-claim', learner, { action: 'accept', bounty: id1 })).j.error === 'client_outdated');
check('the old unsigned withdraw is refused', (await call('bounty-claim', learner, { action: 'withdraw', bounty: id1 })).j.error === 'client_outdated');
const unsigned = await call('bounty-claim', learner, { action: 'accept_submit', bounty: id1 });
check('submit without a signature is refused', unsigned.http === 400 && unsigned.j.error === 'signature_required', JSON.stringify(unsigned.j));
const forged = await signedStep(learner, 'accept', id1, (body) => ({ ...body, signature: signatureOf(sponsor, Buffer.from(body.message, 'base64')) }));
check("another wallet's signature is refused", forged.http === 400 && forged.j.error === 'invalid_signature', JSON.stringify(forged.j));
const stolen = await signedStep(learner, 'accept', id1, (body, offer) => {
  const offered = decodeMessage(Uint8Array.from(Buffer.from(offer.message_base64, 'base64')));
  const steal = { programId: SYSTEM_PROGRAM, accounts: [{ address: offer.fee_payer, signer: true, writable: true }, { address: learner.address, writable: true }], data: transferData(50_000_000n) };
  const message = compileMessage(offer.fee_payer, [...offered.instructions, steal], offered.recentBlockhash);
  return { message: base64Encode(message), signature: signatureOf(learner, Buffer.from(message)) };
});
check('a transfer out of the fee payer slipped into the transaction is refused, validly signed or not', stolen.http === 400 && stolen.j.error === 'invalid_transaction', JSON.stringify(stolen.j));
await agree('after the refused attempts nothing moved', slug1, { status: 'open' });

const accepted = await acceptBounty(learner, id1);
check('accept: the learner signed, the server sent', accepted.http === 200 && accepted.j.chain?.signed_by === learner.address, JSON.stringify(accepted.j).slice(0, 240));
let { page } = await agree('accepted', slug1, { status: 'claimed', holder: learner.address });
await learnerSigned('accepted', page, 'accepted');

const gaveUp = await withdrawBounty(learner, id1);
check('give up: the learner signed, the server sent', gaveUp.http === 200 && gaveUp.j.chain?.signed_by === learner.address, JSON.stringify(gaveUp.j).slice(0, 240));
({ page } = await agree('given up: the account names nobody', slug1, { status: 'open' }));
await learnerSigned('given up', page, 'withdrawn');

check('accept again', (await acceptBounty(learner, id1)).http === 200);
check('deliver', (await call('bounty-claim', learner, { action: 'submit', bounty: id1, url: 'https://example.com/first-try' })).http === 200);
({ page } = await agree('delivered (the account still holds it for the learner)', slug1, { status: 'submitted', holder: learner.address }));
check('delivered: the ledger row is a server record and carries no transaction', lastEvent(page, 'submitted')?.signature === null && lastEvent(page, 'submitted')?.signed_by === null);

check('reject', (await call('bounty-sponsor', sponsor, { action: 'reject', bounty: id1, note: 'e2e: not yet' })).http === 200);
({ page } = await agree('rejected: the account names nobody', slug1, { status: 'open' }));
await iteraSigned('rejected', page, 'rejected');

check('accept a third time', (await acceptBounty(learner, id1)).http === 200);
check('deliver again', (await call('bounty-claim', learner, { action: 'submit', bounty: id1, url: 'https://example.com/second-try' })).http === 200);
let approved = await call('bounty-sponsor', sponsor, { action: 'approve', bounty: id1 });
for (let tries = 0; tries < 15 && approved.j.status !== 'paid'; tries += 1) {
  await sleep(3000);
  approved = await call('bounty-sponsor', sponsor, { action: 'approve', bounty: id1 });
}
({ page } = await agree('approved and paid', slug1, { status: 'paid', holder: learner.address }));
const payout = await rpc('getTransaction', [page.payout.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
const paidAt = payout.transaction.message.accountKeys.indexOf(learner.address);
check('paid: the payout transaction moved exactly the reward into the learner wallet', payout.meta.postBalances[paidAt] - payout.meta.preBalances[paidAt] === REWARD, page.payout.explorer_url);
console.log('  payout', page.payout.explorer_url);

// --- Bounty 2: accept, run out of time, refund -------------------------------
const slug2 = `e2e-agree-x-${stamp}`;
const id2 = await post(slug2);
check('accept the second bounty', (await acceptBounty(learner, id2)).http === 200);
await agree('accepted', slug2, { status: 'claimed', holder: learner.address });
await sql(`update itera.bounty_claims set deadline_at = now() - interval '1 minute' where bounty_id = '${id2}' and status = 'active'`);
({ page } = await agree('out of time: the account names nobody', slug2, { status: 'open' }));
await iteraSigned('out of time', page, 'expired');

let refunded = await call('bounty-sponsor', sponsor, { action: 'refund', bounty: id2 });
for (let tries = 0; tries < 15 && refunded.j.status !== 'refunded'; tries += 1) {
  await sleep(3000);
  refunded = await call('bounty-sponsor', sponsor, { action: 'refund', bounty: id2 });
}
({ page } = await agree('refunded', slug2, { status: 'refunded' }));
check('refunded: the ledger row links the transaction', Boolean(lastEvent(page, 'refunded')?.signature), page.refund?.explorer_url);
check('a refunded bounty cannot be accepted', (await acceptBounty(learner, id2)).http === 409);

console.log(JSON.stringify({ slug1, slug2, learner: learner.address, pages: [`/bounties/${slug1}`, `/bounties/${slug2}`] }));
done();
