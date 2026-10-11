#!/usr/bin/env node
// End-to-end check of a bounty posted and funded by an OUTSIDE wallet, on the hackathon project and
// Solana devnet, through the public API (`bounty-post`): the form's limits, funding signed by the
// sponsor's own wallet, the escrow account naming that wallet as sponsor AND approver, the board,
// reports and moderation, and the refund signed by the same wallet. No key of Itera signs a
// transaction that moves this bounty's money.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   node scripts/hackathon/bounty-wallet-sponsor-e2e.mjs
//
// Environment: SUPABASE_ACCESS_TOKEN (read-back SQL and the anon key), HACKATHON_AUTHORITY_KEYFILE
// (default ~/.config/itera-hackathon/devnet-authority.json) gives the throwaway sponsor wallet
// 0.05 devnet SOL. Rows it leaves are marked `is_test`. Run `select itera.tag_test_accounts();` afterwards.
import { parseEscrowState } from '../../supabase/functions/_shared/bounty-program.ts';
import { buildTransferMessage, base58Encode } from '../../supabase/functions/_shared/solana-tx.ts';
import { balance, call, check, done, explorer, get, latestBlockhash, loadAuthority, loadTreasury, login, rpc, send, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const UNIT = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const TEAM_TENANT = 'fe02614d-0934-40fa-96ed-1f1f63366290';
const REWARD = 10_000_000;
const stamp = Date.now().toString(36);
const form = (extra = {}) => ({
  action: 'create',
  sponsor_name: `E2E Outside ${stamp}`,
  title: { en: `E2E outside sponsor bounty ${stamp}` },
  summary: { en: 'Automated test of a bounty posted and funded by an outside wallet.' },
  brief: { en: 'Context: an automated end-to-end run. What to do: nothing, this bounty is refunded by the script that posted it.' },
  deliverable: { en: 'An https link to the page.' },
  reward_lamports: REWARD, unit_id: UNIT, min_days: 1, expires_in_days: 1, claim_hours: 1, ...extra,
});
const markTest = () => sql(`update itera.bounties set is_test = true where sponsor_name like 'E2E Outside %' and not is_test`);
const accountKeys = (messageBase64) => {
  const bytes = Buffer.from(messageBase64, 'base64');
  const count = bytes[3];
  return Array.from({ length: count }, (_, index) => base58Encode(bytes.subarray(4 + index * 32, 36 + index * 32)));
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
    answer = await call('bounty-post', who, { action: 'confirm', bounty });
    if (answer.j?.status === want) break;
    await sleep(1500);
  }
  return answer;
};

const authority = loadAuthority();
const treasury = loadTreasury();
const sponsor = await login(wallet(`outside-${stamp}`));
const other = await login(wallet('b-uncertified'));
const staff = await login(wallet('sponsor'));
console.log('outside sponsor', sponsor.address, '\nother', other.address, '\ntreasury', treasury.address);

const options = await get('bounty-post');
check('the form options are public', options.http === 200 && options.j.trails.length === 3 && options.j.limits.min_reward_lamports === 10_000_000, JSON.stringify(options.j.limits));
check('anonymous cannot post', (await call('bounty-post', null, { action: 'list' })).http === 401);
check("a name of the team is refused", (await call('bounty-post', sponsor, form({ sponsor_name: 'DevFellowship' }))).j.error === 'invalid_sponsor');
check('a reward under the floor is refused', (await call('bounty-post', sponsor, form({ reward_lamports: 5_000_000 }))).j.error === 'invalid_reward');
check('a deadline over the limit is refused', (await call('bounty-post', sponsor, form({ expires_in_days: 60 }))).j.error === 'invalid_deadline');

const created = await call('bounty-post', sponsor, form());
check('an outside wallet posts a bounty', created.http === 200 && Boolean(created.j.slug), JSON.stringify(created.j));
const { id, slug } = created.j;
let board = (await get('bounty-board?lang=en')).j;
check('an unfunded wallet bounty is NOT on the public board', !board.bounties.some((bounty) => bounty.id === id));
let view = (await get(`bounty-board/${slug}?lang=en`)).j;
check('its page says who posted it and who approves', view.status === 'awaiting_funding' && view.posted_by.kind === 'wallet' && view.posted_by.wallet === sponsor.address && view.approver === 'sponsor_wallet' && view.escrow.refund_address === sponsor.address, JSON.stringify(view.posted_by));
check('another wallet cannot act on it', (await call('bounty-post', other, { action: 'fund_tx', bounty: id })).http === 404);
check('with an empty wallet the funding is refused with the amount needed', await (async () => {
  const answer = await call('bounty-post', sponsor, { action: 'fund_tx', bounty: id });
  return answer.http === 402 && answer.j.error === 'insufficient_funds' && answer.j.required_lamports > REWARD;
})());

await send(authority, buildTransferMessage({ payer: authority.address, recipient: sponsor.address, lamports: 50_000_000n, memo: 'e2e: outside sponsor top-up', recentBlockhash: await latestBlockhash() }));
const before = await balance(sponsor.address);
const treasuryBefore = await balance(treasury.address);
const fund = await call('bounty-post', sponsor, { action: 'fund_tx', bounty: id });
const fundKeys = fund.http === 200 ? accountKeys(fund.j.message_base64) : [];
check('the funding transaction is built for the sponsor wallet alone', fund.http === 200 && fundKeys[0] === sponsor.address && Buffer.from(fund.j.message_base64, 'base64')[0] === 1 && !fundKeys.includes(treasury.address) && !fundKeys.includes(authority.address), JSON.stringify(fundKeys));
const fundSignature = await send(sponsor, Buffer.from(fund.j.message_base64, 'base64'));
console.log('fund', explorer('tx', fundSignature));
const opened = await confirmUntil(sponsor, id, 'open');
check('the bounty opens once the escrow account exists', opened.j?.status === 'open' && opened.j.funding_signature === fundSignature, JSON.stringify(opened.j));
const state = await escrowState(view.escrow.address);
check('ON CHAIN: sponsor and approver are the outside wallet, the reward is locked', state?.status === 'open' && state.sponsor === sponsor.address && state.approver === sponsor.address && state.amount === BigInt(REWARD), JSON.stringify(state, (_, value) => (typeof value === 'bigint' ? String(value) : value)));
check('ON CHAIN: the only signer of the funding is the outside wallet', JSON.stringify(await signers(fundSignature)) === JSON.stringify([sponsor.address]));
check('the treasury paid nothing', (await balance(treasury.address)) === treasuryBefore);
check('the sponsor paid reward + rent + fee', before - (await balance(sponsor.address)) === REWARD + fund.j.rent_lamports + 5000, String(before - (await balance(sponsor.address))));

board = (await get('bounty-board?lang=en')).j;
const card = board.bounties.find((bounty) => bounty.id === id);
check('the funded bounty is on the public board as an outside sponsor', card?.status === 'open' && card.posted_by.kind === 'wallet' && board.stats.outside_sponsor_count >= 1, JSON.stringify(board.stats));
check('the team console does not reach it', (await call('bounty-sponsor', staff, { action: 'refund', bounty: id })).http === 404);

check('a learner reports it', (await call('bounty-post', other, { action: 'report', bounty: id, reason: 'e2e: report path' })).j?.reported === true);
const moderation = await call('bounty-sponsor', staff, { action: 'moderation' });
check('Itera staff sees it with the report', moderation.http === 200 && moderation.j.bounties.find((row) => row.id === id)?.bounty_reports.length === 1, String(moderation.http));
check('a non-staff wallet cannot moderate', (await call('bounty-sponsor', other, { action: 'hide', bounty: id })).http === 403);
check('staff hides it', (await call('bounty-sponsor', staff, { action: 'hide', bounty: id, reason: 'e2e' })).j?.hidden === true);
await sleep(6000);
check('a hidden bounty leaves the board', !(await get(`bounty-board?lang=pt&t=${stamp}`)).j.bounties.some((bounty) => bounty.id === id));
check('hiding moved no money', (await escrowState(view.escrow.address))?.status === 'open');
check('staff unhides it', (await call('bounty-sponsor', staff, { action: 'unhide', bounty: id })).j?.hidden === false);
await markTest();

const mine = await call('bounty-post', sponsor, { action: 'list' });
check('the sponsor console lists it', mine.http === 200 && mine.j.wallet === sponsor.address && mine.j.bounties.some((bounty) => bounty.id === id && bounty.status === 'open'));
const refund = await call('bounty-post', sponsor, { action: 'refund_tx', bounty: id });
const refundKeys = refund.http === 200 ? accountKeys(refund.j.message_base64) : [];
check('the refund transaction is built for the sponsor wallet alone', refund.http === 200 && refundKeys[0] === sponsor.address && !refundKeys.includes(treasury.address), JSON.stringify(refund.j?.error ?? refundKeys));
const midway = await balance(sponsor.address);
const refundSignature = await send(sponsor, Buffer.from(refund.j.message_base64, 'base64'));
console.log('refund', explorer('tx', refundSignature));
const refunded = await confirmUntil(sponsor, id, 'refunded');
check('the bounty reads refunded, with the sponsor own transaction', refunded.j?.status === 'refunded' && refunded.j.refund_signature === refundSignature, JSON.stringify(refunded.j));
check('ON CHAIN: refunded, and the reward is back in the sponsor wallet', (await escrowState(view.escrow.address))?.status === 'refunded' && (await balance(sponsor.address)) - midway === REWARD - 5000, String((await balance(sponsor.address)) - midway));
check('ON CHAIN: the only signer of the refund is the outside wallet', JSON.stringify(await signers(refundSignature)) === JSON.stringify([sponsor.address]));
view = (await get(`bounty-board/${slug}?lang=en`)).j;
check('the ledger links both transactions', view.status === 'refunded' && view.events.some((event) => event.kind === 'funded' && event.signature === fundSignature) && view.events.some((event) => event.kind === 'refunded' && event.signature === refundSignature), JSON.stringify(view.events.map((event) => event.kind)));

await call('bounty-post', sponsor, form());
await call('bounty-post', sponsor, form());
check('the fourth bounty of the day is refused', await (async () => {
  const answer = await call('bounty-post', sponsor, form());
  return answer.http === 429 && answer.j.error === 'too_many_today';
})());
await markTest();
done();
