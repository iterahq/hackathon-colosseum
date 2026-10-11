#!/usr/bin/env node
// End-to-end check of the bounties on the hackathon project and Solana devnet, through the public
// API: the capability gate, three simultaneous accepts, the payout, three simultaneous approvals,
// reject, refund, and a wallet funding a bounty through the Solana Action.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   node scripts/hackathon/bounty-e2e.mjs
//
// Environment: SUPABASE_ACCESS_TOKEN (SQL set-up through the Management API, and the anon key
// unless HACKATHON_ANON_KEY is set). Optional: HACKATHON_AUTHORITY_KEYFILE (default
// ~/.config/itera-hackathon/devnet-authority.json) tops the sponsor wallet up so the Action path can
// run; without it that path is skipped. RUN=<label> reuses the learners of an earlier run.
//
// Throwaway wallets are kept in ~/.config/itera-hackathon/bounty-e2e-keys (BOUNTY_E2E_KEYS). The
// sponsor wallet is made an instructor of the DevFellowship tenant. Every bounty it posts is marked
// `is_test` and stays off the public board. Costs the authority two certification mints and the
// treasury a few fees and three escrow rents (about 0.02 SOL in all). Never touches the owner's
// wallet or the demo account.
import { buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { acceptBounty, balance, call, check, completeDays, done, explorer, get, history, latestBlockhash, loadAuthority, login, passport, rpc, send, sendUnsigned, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const UNIT = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const TENANT = 'fe02614d-0934-40fa-96ed-1f1f63366290';
const REWARD = 5_000_000;
const stamp = Date.now().toString(36);
const RUN = process.env.RUN ?? stamp;
const form = (slug, extra = {}) => ({
  action: 'create', slug, sponsor_name: 'E2E Sponsor',
  title: { pt: `Teste e2e ${slug}`, en: `E2E test ${slug}` },
  summary: { pt: 'Missão de teste automatizado.', en: 'Automated test bounty.' },
  brief: { pt: 'Tarefa de teste do fluxo de missões pagas.', en: 'Test task for the paid bounty flow.' },
  deliverable: { pt: 'Um link https', en: 'An https link' },
  reward_lamports: REWARD, unit_id: UNIT, min_days: 2, expires_in_days: 1, ...extra,
});

const sponsor = await login(wallet('sponsor'));
const a = await login(wallet(`a-${RUN}`));
const d = await login(wallet(`d-${RUN}`));
const b = await login(wallet('b-uncertified'));
console.log('sponsor', sponsor.address, '\nA', a.address, '\nD', d.address, '\nB', b.address);

// Staff: the e2e sponsor teaches in the DevFellowship tenant. B never does.
check('non-staff is refused by the sponsor API', (await call('bounty-sponsor', b, { action: 'list' })).http === 403);
check('anonymous is refused by the sponsor API', (await call('bounty-sponsor', null, { action: 'list' })).http === 401);
check('anonymous is refused by the claim API', (await call('bounty-claim', null, { action: 'status', bounty: UNIT })).http === 401);
await sql(`insert into itera.memberships (user_id, tenant_id, role) select i.user_id, '${TENANT}', 'instructor' from itera.identities i where i.provider_subject='${sponsor.authUid}' on conflict (user_id, tenant_id) do update set role = 'instructor'`);
const listed = await call('bounty-sponsor', sponsor, { action: 'list' });
check('staff lists bounties and trails', listed.http === 200 && listed.j.trails.length === 3 && listed.j.treasury_tenant === TENANT, JSON.stringify(listed.j.trails?.map((t) => t.total_days)));

// --- Bounty 1: the paid path -------------------------------------------------
const slug1 = `e2e-pay-${stamp}`;
check('bad form is refused', (await call('bounty-sponsor', sponsor, form(slug1, { reward_lamports: 10 }))).j.error === 'invalid_reward');
const created = await call('bounty-sponsor', sponsor, form(slug1));
check('sponsor creates a bounty', created.http === 200, JSON.stringify(created.j));
check('duplicate slug is refused', (await call('bounty-sponsor', sponsor, form(slug1))).j.error === 'slug_taken');
const id1 = created.j.id;
const markTest = () => sql(`update itera.bounties set is_test = true where slug like 'e2e-%' and not is_test`);
await markTest();
let view = (await get(`bounty-board/${slug1}`)).j;
const escrow1 = view.escrow.address;
const PROGRAM = view.escrow.kind === 'program';
// Bounties posted since the gated program hold their terms in a 228-byte account.
const RENT = await rpc('getMinimumBalanceForRentExemption', [228]);
const LOCKED = PROGRAM ? REWARD + RENT : REWARD + 5000;
const EMPTY = PROGRAM ? RENT : 0;
console.log('escrow kind', view.escrow.kind, view.escrow.program_id ?? '');
check('new bounty waits for funding, escrow empty', view.status === 'awaiting_funding' && (await balance(escrow1)) === 0, escrow1);
check('unfunded bounty cannot be accepted', (await acceptBounty(a, id1)).http === 409);

const funded = await call('bounty-sponsor', sponsor, { action: 'fund', bounty: id1 });
check('treasury funds the escrow', funded.http === 200 && funded.j.status === 'open', JSON.stringify(funded.j));
check('escrow holds the reward on chain', (await balance(escrow1)) === LOCKED, explorer('address', escrow1));
console.log('  fund tx', explorer('tx', funded.j.signature));

// Wallet B: no certification.
const statusB = await call('bounty-claim', b, { action: 'status', bounty: id1 });
check('B status: not eligible, no certification', statusB.j.eligible === false && statusB.j.reason === 'no_certification', JSON.stringify(statusB.j));
const acceptB = await acceptBounty(b, id1);
check('B (uncertified) is refused server-side', acceptB.http === 403 && acceptB.j.error === 'not_eligible', JSON.stringify(acceptB.j));

// Wallet A: one stamped day is not enough; three are.
await completeDays(a.authUid, 1, 1);
let minted = await passport(a);
check('A minted a certification (day 1)', minted.http === 200, JSON.stringify(minted.j?.mint ?? minted.j).slice(0, 200));
const acceptEarly = await acceptBounty(a, id1);
check('A with 1 day on chain is refused (needs 2)', acceptEarly.http === 403 && acceptEarly.j.reason === 'not_enough_days' && acceptEarly.j.proof?.days_done === 1, JSON.stringify(acceptEarly.j));
await completeDays(a.authUid, 2, 3);
minted = await passport(a);
await completeDays(d.authUid, 1, 2);
await passport(d);
const statusA = await call('bounty-claim', a, { action: 'status', bounty: id1 });
check('A status: eligible with 3 days read from chain', statusA.j.eligible === true && statusA.j.proof?.days_done === 3, JSON.stringify(statusA.j));
console.log('  A certification', statusA.j.proof?.explorer_url);

// Double claim: A twice and D once, all at the same time.
const race = await Promise.all([
  acceptBounty(a, id1),
  acceptBounty(a, id1),
  acceptBounty(d, id1),
]);
const winners = race.filter((r) => r.http === 200);
const won = race.find((r) => r.http === 200);
if (PROGRAM) { check('the escrow PROGRAM recorded the claim (it read the certification account)', won?.j.chain?.status === 'recorded' && Boolean(won.j.chain.signature), JSON.stringify(won?.j.chain)); console.log('  accept tx', explorer('tx', won?.j.chain?.signature)); }
check('three simultaneous accepts: exactly one wins', winners.length === 1 && race.filter((r) => r.http === 409).length === 2, JSON.stringify(race.map((r) => [r.http, r.j.error ?? 'ok'])));
const holder = race[2].http === 200 ? d : a;
const loser = holder === a ? d : a;
check('the loser cannot take it afterwards', (await acceptBounty(loser, id1)).http === 409);
const liveClaims = await sql(`select count(*)::int n from itera.bounty_claims where bounty_id='${id1}' and status in ('active','submitted','approved')`);
check('one live claim in the database', liveClaims[0].n === 1);

check('the loser cannot submit', (await call('bounty-claim', loser, { action: 'submit', bounty: id1, url: 'https://example.com/steal' })).http === 409);
check('http link is refused', (await call('bounty-claim', holder, { action: 'submit', bounty: id1, url: 'http://example.com/x' })).http === 400);
check('approve before delivery is refused', (await call('bounty-sponsor', sponsor, { action: 'approve', bounty: id1 })).http === 409);
check('refund of a claimed bounty is refused', (await call('bounty-sponsor', sponsor, { action: 'refund', bounty: id1 })).http === 409);
const submitted = await call('bounty-claim', holder, { action: 'submit', bounty: id1, url: 'https://codepen.io/itera/pen/e2e', note: 'e2e delivery' });
check('holder submits the work', submitted.http === 200, JSON.stringify(submitted.j));
check('second submit is refused', (await call('bounty-claim', holder, { action: 'submit', bounty: id1, url: 'https://codepen.io/itera/pen/e2e2' })).http === 409);
view = (await get(`bounty-board/${slug1}`)).j;
check('public page hides the delivery until paid', view.status === 'submitted' && view.claim.submission_url === null && view.claim.wallet === holder.address);
check('a learner cannot approve', (await call('bounty-sponsor', holder, { action: 'approve', bounty: id1 })).http === 403);

// Double release: three approvals at once.
const before = await balance(holder.address);
const approvals = await Promise.all([1, 2, 3].map(() => call('bounty-sponsor', sponsor, { action: 'approve', bounty: id1 })));
console.log('  approvals', JSON.stringify(approvals.map((r) => [r.http, r.j.outcome ?? r.j.error, r.j.status])));
for (let i = 0; i < 20; i++) { const r = await call('bounty-sponsor', sponsor, { action: 'approve', bounty: id1 }); if (r.j.status === 'paid') break; await sleep(3000); }
const again = await call('bounty-sponsor', sponsor, { action: 'approve', bounty: id1 });
check('approve is idempotent once paid', again.http === 200 && again.j.status === 'paid', JSON.stringify(again.j));
view = (await get(`bounty-board/${slug1}`)).j;
const after = await balance(holder.address);
check('learner wallet received exactly the reward', after - before === REWARD, `${before} -> ${after}`);
check('escrow no longer holds the reward', (await balance(escrow1)) === EMPTY);
const hist = await history(escrow1);
const payouts = hist.filter((h) => h.err === null && (h.memo ?? '').includes(`itera-bounty:${id1}:payout`));
check('exactly one payout transaction on chain', payouts.length === 1 && payouts[0].signature === view.payout.signature, `${hist.length} txs on the escrow account`);
const paidEvents = await sql(`select count(*)::int n from itera.bounty_events where bounty_id='${id1}' and kind='paid'`);
check('exactly one paid row in the ledger', paidEvents[0].n === 1);
check('public page: paid, with explorer proof and the delivery', view.status === 'paid' && view.payout.wallet === holder.address && view.claim.submission_url === 'https://codepen.io/itera/pen/e2e' && view.events.some((e) => e.kind === 'paid' && e.signature));
console.log('  payout tx', view.payout.explorer_url);
check('reject after payment is refused', (await call('bounty-sponsor', sponsor, { action: 'reject', bounty: id1 })).http === 409);
check('refund after payment is refused', (await call('bounty-sponsor', sponsor, { action: 'refund', bounty: id1 })).http === 409);
const earned = (await get(`bounty-board/wallet/${holder.address}`)).j;
check('earnings endpoint: verified on chain', earned.bounties_paid >= 1 && earned.items.some((i) => i.slug === slug1 && i.verified) && earned.earned_lamports >= REWARD, JSON.stringify({ n: earned.bounties_paid, sol: earned.earned_sol }));
check('earnings of a wallet with nothing', (await get(`bounty-board/wallet/${b.address}`)).j.bounties_paid === 0);

// --- Bounty 2: reject, then refund ------------------------------------------
const slug2 = `e2e-refund-${stamp}`;
const id2 = (await call('bounty-sponsor', sponsor, form(slug2))).j.id;
await call('bounty-sponsor', sponsor, { action: 'fund', bounty: id2 });
await markTest();
const escrow2 = (await get(`bounty-board/${slug2}`)).j.escrow.address;
check('second bounty has its own escrow account', escrow2 !== escrow1 && (await balance(escrow2)) === LOCKED);
const acc2 = await acceptBounty(loser, id2);
check('another certified wallet accepts bounty 2', acc2.http === 200, JSON.stringify(acc2.j));
await call('bounty-claim', loser, { action: 'submit', bounty: id2, url: 'https://example.com/weak' });
const rejected = await call('bounty-sponsor', sponsor, { action: 'reject', bounty: id2, note: 'not what was asked' });
check('sponsor rejects: bounty reopens, money stays locked', rejected.http === 200 && (await balance(escrow2)) === LOCKED && (await get(`bounty-board/${slug2}`)).j.status === 'open');
const reB = await call('bounty-claim', loser, { action: 'status', bounty: id2 });
check('the learner sees the rejection note', reB.j.claim?.status === 'rejected' && reB.j.claim?.review_note === 'not what was asked');
const refundTo = (await get(`bounty-board/${slug2}`)).j.escrow.refund_address;
const treasuryBefore = await balance(refundTo);
const refunds = await Promise.all([1, 2].map(() => call('bounty-sponsor', sponsor, { action: 'refund', bounty: id2 })));
console.log('  refunds', JSON.stringify(refunds.map((r) => [r.http, r.j.outcome ?? r.j.error, r.j.status])));
for (let i = 0; i < 20; i++) { const r = await call('bounty-sponsor', sponsor, { action: 'refund', bounty: id2 }); if (r.j.status === 'refunded') break; await sleep(3000); }
view = (await get(`bounty-board/${slug2}`)).j;
const hist2 = (await history(escrow2)).filter((h) => h.err === null && (h.memo ?? '').includes(`itera-bounty:${id2}:refund`));
check('refund: one transaction, escrow empty, sponsor repaid', view.status === 'refunded' && hist2.length === 1 && (await balance(escrow2)) === EMPTY && (PROGRAM ? (await balance(refundTo)) - treasuryBefore >= REWARD - 20000 : (await balance(refundTo)) - treasuryBefore === REWARD), view.refund?.explorer_url);
check('a refunded bounty cannot be accepted', (await acceptBounty(loser, id2)).http === 409);

// --- Bounty 3: funded by a wallet through the Solana Action ------------------
const slug3 = `e2e-blink-${stamp}`;
const id3 = (await call('bounty-sponsor', sponsor, form(slug3, { refund_address: sponsor.address }))).j.id;
await markTest();
const action = await get(`bounty-action/${slug3}`);
check('action GET describes the funding', action.http === 200 && action.j.type === 'action' && action.j.links.actions[0].href.includes(`bounty-action/${slug3}`), action.j.links?.actions?.[0]?.label);
check('action refuses a non-key account', (await call(`bounty-action/${slug3}`, null, { account: '11111111111111111111111111111111' })).http === 400);
check('action refuses a wallet without funds', (await call(`bounty-action/${slug3}`, null, { account: b.address })).http === 400);
// The Action path needs a payer with devnet SOL: the authority tops the sponsor wallet up when its key file is at hand.
if ((await balance(sponsor.address)) < 12_000_000) {
  try {
    const authority = loadAuthority();
    await send(authority, buildTransferMessage({ payer: authority.address, recipient: sponsor.address, lamports: 20_000_000n, memo: 'bounty-e2e: funding', recentBlockhash: await latestBlockhash() }));
  } catch (error) {
    console.log(`  sponsor wallet not topped up: ${error instanceof Error ? error.message : error}`);
  }
}
const sponsorBalance = await balance(sponsor.address);
if (sponsorBalance >= LOCKED + 5000 + 890880) {
  const post = await call(`bounty-action/${slug3}`, null, { account: sponsor.address });
  check('action POST returns a transaction', post.http === 200 && post.j.type === 'transaction' && post.j.links.next.href.includes('confirm'), JSON.stringify(post.j).slice(0, 120));
  const signature = await sendUnsigned(sponsor, post.j.transaction);
  console.log('  blink fund tx', explorer('tx', signature));
  const next = await fetch(post.j.links.next.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: sponsor.address, signature }) });
  const completed = await next.json();
  view = (await get(`bounty-board/${slug3}`)).j;
  check('blink payment opens the bounty', completed.type === 'completed' && view.status === 'open' && view.funding.lamports === (PROGRAM ? REWARD : REWARD + 5000), JSON.stringify({ status: view.status, funding: view.funding?.signature }));
  check('action is disabled once funded', (await get(`bounty-action/${slug3}`)).j.disabled === true);
  for (let i = 0; i < 20; i++) { const r = await call('bounty-sponsor', sponsor, { action: 'refund', bounty: id3 }); if (r.j.status === 'refunded') break; await sleep(3000); }
  check('refund returns to the sponsor wallet', (await balance(sponsor.address)) === sponsorBalance - (PROGRAM ? RENT + 5000 : 10000), `${sponsorBalance} -> ${await balance(sponsor.address)}`);
} else {
  console.log(`SKIP  blink positive path: sponsor wallet ${sponsor.address} holds ${sponsorBalance} lamports`);
}
check('board answers with stats', typeof (await get('bounty-board')).j.stats.open_count === 'number');
console.log(JSON.stringify({ slug1, slug2, slug3, id1, id2, id3, holder: holder.address }));
done();
