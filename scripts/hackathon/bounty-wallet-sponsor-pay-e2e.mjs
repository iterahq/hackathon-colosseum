#!/usr/bin/env node
// End-to-end check of the PAID path of a bounty posted by an outside wallet, on the hackathon project
// and Solana devnet: a certified learner signs the accept, a hold that ran out releases itself (in
// our tables and on the escrow account), a rejection reopens it, and the sponsor's wallet alone signs
// the payout. The Itera treasury signs no instruction that moves the reward and its balance is
// compared before and after the payout.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   RUN=<label of a bounty-e2e.mjs run whose learners are certified> node scripts/hackathon/bounty-wallet-sponsor-pay-e2e.mjs
//
// Needs two learners already certified by `bounty-e2e.mjs` (wallets `a-<RUN>` with 3 stamped days and
// `d-<RUN>` with 2). Gives a throwaway sponsor wallet 0.05 devnet SOL from the authority. Rows are
// marked `is_test`. The paid learner is tagged by id in `itera.test_accounts`; tag the other wallets of the run by id too.
import { parseEscrowState } from '../../supabase/functions/_shared/bounty-program.ts';
import { buildTransferMessage, base58Encode } from '../../supabase/functions/_shared/solana-tx.ts';
import { acceptBounty, balance, call, check, done, explorer, get, latestBlockhash, loadAuthority, loadTreasury, login, rpc, send, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const UNIT = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const REWARD = 10_000_000;
const RUN = process.env.RUN;
if (!RUN) throw new Error('RUN is not set: the label of a bounty-e2e.mjs run whose learners hold a certification');
const stamp = Date.now().toString(36);

const accountKeys = (messageBase64) => {
  const bytes = Buffer.from(messageBase64, 'base64');
  return Array.from({ length: bytes[3] }, (_, index) => base58Encode(bytes.subarray(4 + index * 32, 36 + index * 32)));
};
const escrowState = async (address) => {
  const info = (await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }])).value;
  return info ? parseEscrowState(Uint8Array.from(Buffer.from(info.data[0], 'base64'))) : null;
};
const signers = async (signature) => {
  const tx = await rpc('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  return tx.transaction.message.accountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures);
};
const confirmUntil = async (who, bounty, want) => {
  let answer = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    answer = await call('bounty-post', who, { action: 'confirm', bounty, note: 'e2e: approved' });
    if (answer.j?.status === want) break;
    await sleep(1500);
  }
  return answer;
};
const page = async (slug) => (await get(`bounty-board/${slug}?lang=en`)).j;

const authority = loadAuthority();
const treasury = loadTreasury();
const sponsor = await login(wallet(`outside-pay-${stamp}`));
const a = await login(wallet(`a-${RUN}`));
const d = await login(wallet(`d-${RUN}`));
console.log('outside sponsor', sponsor.address, '\nA', a.address, '\nD', d.address);

await send(authority, buildTransferMessage({ payer: authority.address, recipient: sponsor.address, lamports: 50_000_000n, memo: 'e2e: outside sponsor top-up', recentBlockhash: await latestBlockhash() }));
const created = await call('bounty-post', sponsor, {
  action: 'create', sponsor_name: `E2E Outside ${stamp}`,
  title: { en: `E2E outside sponsor paid path ${stamp}` },
  summary: { en: 'Automated test of the paid path of a bounty posted by an outside wallet.' },
  brief: { en: 'Context: an automated end-to-end run. What to do: deliver any https link; the script that posted this approves it.' },
  deliverable: { en: 'An https link to the page.' },
  reward_lamports: REWARD, unit_id: UNIT, min_days: 1, expires_in_days: 1, claim_hours: 1,
});
check('an outside wallet posts a bounty', created.http === 200, JSON.stringify(created.j));
const { id, slug } = created.j;
await sql(`update itera.bounties set is_test = true where id = '${id}'`);
const fund = await call('bounty-post', sponsor, { action: 'fund_tx', bounty: id });
const fundSignature = await send(sponsor, Buffer.from(fund.j.message_base64, 'base64'));
check('it funds the escrow from its own wallet', (await call('bounty-post', sponsor, { action: 'confirm', bounty: id })).j?.status === 'open', fundSignature);
const escrow = (await page(slug)).escrow.address;

// --- accept, signed by the learner -------------------------------------------
const accepted = await acceptBounty(a, id);
check('a certified learner accepts with its own signature', accepted.http === 200, JSON.stringify(accepted.j).slice(0, 200));
let state = await escrowState(escrow);
check('ON CHAIN: the escrow names the learner, the approver is still the sponsor wallet', state?.status === 'claimed' && state.claimant === a.address && state.approver === sponsor.address);
let view = await page(slug);
const acceptEvent = view.events.find((event) => event.kind === 'accepted');
const acceptSigners = acceptEvent?.signature ? await signers(acceptEvent.signature) : [];
check('ON CHAIN: the accept carries the learner signature', acceptSigners.includes(a.address), JSON.stringify(acceptSigners));
check('the page says who holds it and until when', view.status === 'claimed' && view.claim?.wallet === a.address && Date.parse(view.claim.deadline_at) > Date.now(), JSON.stringify(view.claim));
check('the sponsor cannot refund a held bounty', (await call('bounty-post', sponsor, { action: 'refund_tx', bounty: id })).j?.error === 'not_refundable');
check('the sponsor cannot approve before a delivery', (await call('bounty-post', sponsor, { action: 'approve_tx', bounty: id })).j?.error === 'not_submitted');

// --- the hold runs out ---------------------------------------------------------
await sql(`update itera.bounty_claims set deadline_at = now() - interval '1 minute' where bounty_id = '${id}' and status = 'active'`);
view = await page(slug);
check('a hold that ran out releases itself on the next read', view.status === 'open' && view.claim === null && view.events.some((event) => event.kind === 'expired'), JSON.stringify(view.events.map((event) => event.kind)));
await sleep(2500);
state = await escrowState(escrow);
check('ON CHAIN: the escrow no longer names that learner', state?.status === 'open' && state.claimant === null, JSON.stringify({ status: state?.status, claimant: state?.claimant }));
const expiredEvent = (await page(slug)).events.find((event) => event.kind === 'expired');
check('the release has a transaction on the ledger', Boolean(expiredEvent?.signature), String(expiredEvent?.signature));

// --- another learner takes it, delivers, is rejected ---------------------------
check('the next learner accepts the reopened bounty', (await acceptBounty(d, id)).http === 200);
check('an http link is refused', (await call('bounty-claim', d, { action: 'submit', bounty: id, url: 'http://example.com/x' })).j?.error === 'invalid_submission');
check('an https link is delivered', (await call('bounty-claim', d, { action: 'submit', bounty: id, url: 'https://example.com/e2e-delivery', note: 'e2e' })).j?.submitted === true);
const mine = await call('bounty-post', sponsor, { action: 'list' });
check('the sponsor console shows the delivery and the proof', mine.j?.bounties.find((bounty) => bounty.id === id)?.review?.submission_url === 'https://example.com/e2e-delivery');
check('another wallet cannot approve it', (await call('bounty-post', a, { action: 'approve_tx', bounty: id })).http === 404);
const rejected = await call('bounty-post', sponsor, { action: 'reject', bounty: id, note: 'e2e: not this one' });
check('the sponsor rejects: the bounty reopens with the money locked', rejected.j?.rejected === true && Boolean(rejected.j.unclaim_signature), JSON.stringify(rejected.j));
state = await escrowState(escrow);
check('ON CHAIN: reopened, reward still locked', state?.status === 'open' && state.amount === BigInt(REWARD));

// --- the first learner again: delivered, approved, paid by the sponsor's wallet -
check('the first learner accepts again', (await acceptBounty(a, id)).http === 200);
check('and delivers', (await call('bounty-claim', a, { action: 'submit', bounty: id, url: 'https://example.com/e2e-approved' })).j?.submitted === true);
const learnerBefore = await balance(a.address);
const treasuryBefore = await balance(treasury.address);
const approve = await call('bounty-post', sponsor, { action: 'approve_tx', bounty: id });
const approveKeys = approve.http === 200 ? accountKeys(approve.j.message_base64) : [];
check('the payout transaction is built for the sponsor wallet alone', approve.http === 200 && approveKeys[0] === sponsor.address && Buffer.from(approve.j.message_base64, 'base64')[0] === 1 && !approveKeys.includes(treasury.address) && approve.j.pays === a.address, JSON.stringify(approve.j?.error ?? approveKeys));
const payout = await send(sponsor, Buffer.from(approve.j.message_base64, 'base64'));
console.log('payout', explorer('tx', payout));
const paid = await confirmUntil(sponsor, id, 'paid');
check('the bounty reads paid, with the sponsor own transaction', paid.j?.status === 'paid' && paid.j.payout_signature === payout, JSON.stringify(paid.j));
state = await escrowState(escrow);
check('ON CHAIN: paid to the learner, exactly the reward', state?.status === 'paid' && state.claimant === a.address && (await balance(a.address)) - learnerBefore === REWARD, String((await balance(a.address)) - learnerBefore));
check('ON CHAIN: the only signer of the payout is the sponsor wallet', JSON.stringify(await signers(payout)) === JSON.stringify([sponsor.address]));
check('the treasury balance did not move during the payout', (await balance(treasury.address)) === treasuryBefore);
// The paid learner is this script's own throwaway account: it is tagged here, by id, never by the blanket function
// (which would tag every account created so far, a real learner included).
await sql(`insert into itera.test_accounts (user_id, reason) select i.user_id, 'bounty-wallet-sponsor-pay-e2e: paid learner' from itera.identities i where i.provider_subject = '${a.authUid}' on conflict (user_id) do nothing`);
view = await page(slug);
check('the page shows the payout and the delivery', view.status === 'paid' && view.payout?.signature === payout && view.claim?.submission_url === 'https://example.com/e2e-approved' && view.approver === 'sponsor_wallet');
check('a payout to a team test account is named a rehearsal', view.rehearsal === true);
check('a second payout cannot be built', (await call('bounty-post', sponsor, { action: 'approve_tx', bounty: id })).http === 409);
check('what the wallet earned counts it, verified on chain', await (async () => {
  const earned = (await get(`bounty-board/wallet/${a.address}`)).j;
  return earned.items.some((item) => item.signature === payout && item.verified);
})());
console.log('page', `https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/${slug}`);
done();
