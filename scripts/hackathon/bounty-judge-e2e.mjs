#!/usr/bin/env node
// The judge bounty, end to end on devnet, through the deployed functions: a brand-new wallet holding 0 SOL
// stamps Day 1, accepts a judge bounty with its own signature, delivers code that fails the check (nothing
// changes), delivers code that passes, and is paid by the escrow program in the same call. Then: the same
// wallet is refused a second judge bounty, and the board says what happened.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   node scripts/hackathon/bounty-judge-e2e.mjs
//
// Leaves one throwaway learner, tagged as a team test account BY ID (never the blanket tagger).
// Devnet cost: one judge reward (0.01 SOL) + the rent of its escrow account + fees, from the treasury.
import { parseEscrowState } from '../../supabase/functions/_shared/bounty-program.ts';
import { acceptBounty, balance, call, check, completeDays, done, explorer, get, login, passport, rpc, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const PAGE = '<!DOCTYPE html>\n<html>\n<head>\n<title>Judge e2e</title>\n</head>\n<body>\n<h1>My first page</h1>\n<p>I want to build a class timetable.</p>\n</body>\n</html>';
const escrow = async (address) => {
  const { value } = await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
  return value ? parseEscrowState(Uint8Array.from(Buffer.from(value.data[0], 'base64'))) : null;
};
const board = async () => (await get('bounty-board?lang=en')).j;
const available = (answer) => (answer.bounties ?? []).filter((bounty) => bounty.judge && bounty.status === 'open');

let before = await board();
if (available(before).length === 0) {
  await get('bounty-board/sweep');
  for (let waited = 0; waited < 90 && available(before).length === 0; waited += 6) {
    await sleep(6000);
    before = await board();
  }
}
const judge = available(before)[0];
check('the board lists an open judge bounty, labelled as funded by the team and approved by a check', Boolean(judge) && judge.judge.funded_by === 'team' && judge.judge.approval === 'automatic_check' && judge.judge.checks.length === 5);
if (!judge) done();
console.log(`judge bounty ${judge.slug} (${judge.id}), escrow ${judge.escrow.address}, reward ${judge.reward_sol}`);
const account = await escrow(judge.escrow.address);
check('its escrow account is open on chain, gated: 1 stamped day in its own terms, and the page says the program checks the days', account?.status === 'open' && account.gate?.minDays === 1 && judge.escrow.days_checked_by === 'program');

const learner = await login(wallet(`judge-${Date.now().toString(36)}`));
await sql(`insert into itera.test_accounts (user_id) select i.user_id from itera.identities i where i.provider_subject = '${learner.authUid}' on conflict do nothing`);
console.log(`learner ${learner.address} (tagged as a team test account by id)`);
check('the wallet is new: 0 SOL', (await balance(learner.address)) === 0);

const early = await acceptBounty(learner, judge.id);
check('before any stamp the accept is refused: no certification', early.http === 403 && early.j.error === 'not_eligible');

await completeDays(learner.authUid, 1, 1);
const minted = await passport(learner);
const pass = [...(minted.j?.awards ?? []), ...(minted.j?.updated ?? [])].find((award) => award.key === 'trail_pass' && award.asset_address);
check('Day 1 is stamped on a certification in the wallet', Boolean(pass), JSON.stringify(minted.j).slice(0, 200));

const status = await call('bounty-claim', learner, { action: 'status', bounty: judge.id });
check('the wallet is eligible and has never been paid by a judge bounty', status.j.eligible === true && status.j.judged_before === false);

const undelivered = await call('bounty-claim', learner, { action: 'submit', bounty: judge.id, code: PAGE });
check('code delivered before accepting is refused', undelivered.http === 409 && undelivered.j.error === 'not_active');

const accepted = await acceptBounty(learner, judge.id);
check('accepted with the wallet own signature, 0 SOL', accepted.http === 200 && accepted.j.accepted === true && accepted.j.chain?.signed_by === learner.address, JSON.stringify(accepted.j).slice(0, 200));
console.log('  accept', accepted.j.chain?.explorer_url);
const acceptTx = await rpc('getTransaction', [accepted.j.chain.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
const header = acceptTx.transaction.message.header;
const required = acceptTx.transaction.message.accountKeys.slice(0, header.numRequiredSignatures);
check('the accept transaction: fee paid by the treasury, the learner signed, the program was asked for no attester (gated)', required.length === 2 && required[1] === learner.address && (await escrow(judge.escrow.address))?.claimant === learner.address);

const url = await call('bounty-claim', learner, { action: 'submit', bounty: judge.id, url: 'https://example.com/page', note: 'a link' });
check('a link is not a delivery here: the check needs the code', url.http === 400 && url.j.error === 'invalid_submission');
const bad = await call('bounty-claim', learner, { action: 'submit', bounty: judge.id, code: PAGE.replace('<h1>My first page</h1>', '').replace('<!DOCTYPE html>\n', '') });
check('code that fails says which checks failed, and delivers nothing', bad.http === 200 && bad.j.submitted === false && bad.j.report.checks.filter((entry) => !entry.passed).map((entry) => entry.id).join() === 'doctype,h1', JSON.stringify(bad.j).slice(0, 300));
check('after the failed delivery the bounty is still held, not delivered', (await get(`bounty-board/${judge.id}?lang=en`)).j.status === 'claimed' && (await escrow(judge.escrow.address))?.status === 'claimed');

const started = Date.now();
const good = await call('bounty-claim', learner, { action: 'submit', bounty: judge.id, code: PAGE });
check('code that passes is approved by the check and paid in the same call', good.http === 200 && good.j.submitted === true && good.j.auto_approved === true && good.j.report.passed === true, JSON.stringify(good.j).slice(0, 300));
console.log(`  deliver -> paid in ${((Date.now() - started) / 1000).toFixed(1)} s`, good.j.payout?.explorer_url);
let page = (await get(`bounty-board/${judge.id}?lang=en`)).j;
for (let waited = 0; waited < 60 && page.status !== 'paid'; waited += 5) {
  await sleep(5000);
  page = (await get(`bounty-board/${judge.id}?lang=en`)).j;
}
check('the page says paid, to this wallet, with the transaction', page.status === 'paid' && page.payout?.wallet === learner.address && Boolean(page.payout?.signature));
check('SOL left the escrow to the new wallet: exactly the reward', (await balance(learner.address)) === judge.reward_lamports);
const paidAccount = await escrow(judge.escrow.address);
check('the escrow account says paid, and to whom', paidAccount?.status === 'paid' && paidAccount.claimant === learner.address);
const payoutTx = await rpc('getTransaction', [page.payout.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
check('the payout transaction landed and is the program release', payoutTx?.meta?.err === null && payoutTx.transaction.message.accountKeys.includes(judge.escrow.address));
check('the page shows the delivered code and the report of the check to anyone', page.claim?.submission_code === PAGE && page.claim.check_report?.passed === true && page.claim.check_report.checks.length === 5);
const kinds = (page.events ?? []).map((event) => event.kind);
check('the ledger has every step: funded, accepted, submitted, approved, paid', ['funded', 'accepted', 'submitted', 'approved', 'paid'].every((kind) => kinds.includes(kind)), kinds.join());

const after = await board();
const next = available(after).find((bounty) => bounty.id !== judge.id);
check('the paid judge bounty left the cards and is in the judge history as a team test payout', !(after.bounties ?? []).some((bounty) => bounty.id === judge.id) && after.judge.latest.some((entry) => entry.slug === judge.slug && entry.team_test === true));
check('a payout to a team test account is not counted as a judge payout to an outsider', after.stats.judge_paid_count === before.stats.judge_paid_count);
check('another judge bounty is available', Boolean(next));
if (next) {
  const again = await call('bounty-claim', learner, { action: 'status', bounty: next.id });
  check('the same learner is told it was already paid by a judge bounty', again.j.judged_before === true);
  const second = await acceptBounty(learner, next.id);
  check('and is refused a second one', second.http === 409 && second.j.error === 'judged_before', JSON.stringify(second.j).slice(0, 200));
}
await get('bounty-board/sweep');
let refilled = await board();
for (let waited = 0; waited < 120 && available(refilled).length < 2; waited += 10) {
  await sleep(10_000);
  await get('bounty-board/sweep');
  refilled = await board();
}
check('the refill put a new judge bounty on the board, funded from the treasury', available(refilled).length >= 2);
console.log(JSON.stringify({ bounty: judge.slug, learner: learner.address, accept: explorer('tx', accepted.j.chain.signature), payout: explorer('tx', page.payout.signature) }));
done();
