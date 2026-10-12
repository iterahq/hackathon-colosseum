#!/usr/bin/env node
// End-to-end check of the public FUNDING LINK (Solana Action / Blink) of a bounty posted by a wallet, on the
// hackathon project and Solana devnet: a sponsor wallet posts and does NOT fund; a different wallet, with no
// account on the site, reads the Action, posts its address, signs and sends the transaction it gets back; the
// bounty opens with the sponsor as approver and refund address; a learner is paid by the sponsor's signature;
// a second bounty funded by the link is refunded and the money goes to the SPONSOR, not to the funder.
// It also runs the attacks: tampered terms in the POST, the link of one bounty against another, a funded,
// hidden, expired or deleted bounty, and a funder trying to approve or to take the refund.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   RUN=<label of a bounty-e2e.mjs run whose learners are certified> node scripts/hackathon/bounty-blink-e2e.mjs
//
// Needs the learner `a-<RUN>` certified by `bounty-e2e.mjs`. Gives a throwaway funder 0.04 and a throwaway
// sponsor 0.005 devnet SOL from the authority. Rows are marked `is_test`; the sponsor is tagged by id in
// `itera.test_accounts`.
import { parseEscrowState, refundInstruction } from '../../supabase/functions/_shared/bounty-program.ts';
import { compileMessage, decodeMessage } from '../../supabase/functions/_shared/solana-message.ts';
import { buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { FUNCTIONS, acceptBounty, balance, call, check, done, explorer, get, latestBlockhash, loadAuthority, login, rpc, send, sendUnsigned, signed, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const UNIT = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const REWARD = 10_000_000;
const RUN = process.env.RUN;
if (!RUN) throw new Error('RUN is not set: the label of a bounty-e2e.mjs run whose learners hold a certification');
const stamp = Date.now().toString(36);

// What a wallet that understands Actions does: plain requests, no key of ours, no session.
const action = async (url, body) => {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return { http: response.status, j: await response.json().catch(() => null), cors: response.headers.get('access-control-allow-origin') };
};
const messageOf = (transactionBase64) => Uint8Array.from(Buffer.from(transactionBase64, 'base64').subarray(65));
const escrowState = async (address) => {
  const info = (await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }])).value;
  return info ? parseEscrowState(Uint8Array.from(Buffer.from(info.data[0], 'base64'))) : null;
};
const signers = async (signature) => {
  const tx = await rpc('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  return tx.transaction.message.accountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures);
};
const page = async (slug) => (await get(`bounty-board/${slug}?lang=en`)).j;
const confirmUntil = async (who, bounty, want) => {
  let answer = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    answer = await call('bounty-post', who, { action: 'confirm', bounty, note: 'e2e: approved' });
    if (answer.j?.status === want) break;
    await sleep(1500);
  }
  return answer;
};
/** The escrow program's `create` in a transaction the Action answered: who pays, which account, whose terms. */
const createOf = (transactionBase64, programId) => {
  const decoded = decodeMessage(messageOf(transactionBase64));
  const create = decoded?.instructions.find((instruction) => instruction.programId === programId);
  if (!decoded || !create) return null;
  const view = new DataView(create.data.buffer, create.data.byteOffset, create.data.byteLength);
  return {
    payer: decoded.payer,
    signers: decoded.signers,
    programs: decoded.instructions.map((instruction) => instruction.programId),
    funder: create.accounts[0].address,
    escrow: create.accounts[1].address,
    sponsor: create.accounts[2].address,
    approver: create.accounts[3].address,
    amount: view.getBigUint64(17, true),
    expiresAt: Number(view.getBigInt64(25, true)),
  };
};

const authority = loadAuthority();
const sponsor = await login(wallet(`blink-sponsor-${stamp}`));
const funder = wallet(`blink-funder-${stamp}`);
const a = await login(wallet(`a-${RUN}`));
console.log('sponsor', sponsor.address, '\nfunder ', funder.address, '\nlearner', a.address);
await sql(`insert into itera.test_accounts (user_id, reason) select i.user_id, 'bounty-blink-e2e: sponsor' from itera.identities i where i.provider_subject = '${sponsor.authUid}' on conflict (user_id) do nothing`);
await send(authority, buildTransferMessage({ payer: authority.address, recipient: funder.address, lamports: 40_000_000n, memo: 'e2e: blink funder top-up', recentBlockhash: await latestBlockhash() }));
await send(authority, buildTransferMessage({ payer: authority.address, recipient: sponsor.address, lamports: 5_000_000n, memo: 'e2e: blink sponsor fees', recentBlockhash: await latestBlockhash() }));

const post = async (label) => {
  const created = await call('bounty-post', sponsor, {
    action: 'create', sponsor_name: `E2E Blink ${stamp}`,
    title: { en: `E2E funding link ${label} ${stamp}` },
    summary: { en: 'Automated test of the public funding link of a bounty posted by a wallet.' },
    brief: { en: 'Context: an automated end-to-end run. What to do: deliver any https link; the script that posted this approves it.' },
    deliverable: { en: 'An https link to the page.' },
    reward_lamports: REWARD, unit_id: UNIT, min_days: 1, expires_in_days: 1, claim_hours: 1,
  });
  if (created.http !== 200) throw new Error(`create ${label}: ${JSON.stringify(created.j)}`);
  await sql(`update itera.bounties set is_test = true where id = '${created.j.id}'`);
  return created.j;
};

// --- posted, not funded --------------------------------------------------------
const A = await post('A');
const B = await post('B');
check('the create answer carries the funding link', A.fund?.action_url === `${FUNCTIONS}/bounty-action/${A.slug}` && A.fund.blink_url.startsWith('https://dial.to/?action=solana-action%3A'), JSON.stringify(A.fund));
let view = await page(A.slug);
const viewB = await page(B.slug);
const programId = view.escrow.program_id;
const termsA = { escrow: view.escrow.address, expiresAt: Math.floor(Date.parse(view.expires_at) / 1000) };
check('the unfunded page offers the same link and names the sponsor as refund address', view.status === 'awaiting_funding' && view.fund?.action_url === A.fund.action_url && view.escrow.refund_address === sponsor.address && view.approver === 'sponsor_wallet');
check('the sponsor console offers it too', (await call('bounty-post', sponsor, { action: 'list' })).j?.bounties.find((bounty) => bounty.id === A.id)?.fund?.action_url === A.fund.action_url);
check('nothing was locked yet', (await escrowState(termsA.escrow)) === null && (await balance(termsA.escrow)) === 0);

// --- the Action, read by a wallet with no account here ---------------------------
const described = await action(`${A.fund.action_url}?lang=en`);
check('GET: an Action anyone may read (CORS open)', described.http === 200 && described.j.type === 'action' && described.cors === '*' && !described.j.disabled, JSON.stringify(described.j).slice(0, 160));
check('GET: says it is locked for THIS bounty, that only the sponsor approves and that a refund goes to the SPONSOR, not the funder', described.j.description.includes('THIS bounty') && described.j.description.includes(`only the sponsor's wallet (${sponsor.address}) can approve`) && described.j.description.includes(`returns to the SPONSOR's wallet (${sponsor.address}), not to the wallet that funded it`), described.j.description);
const describedPt = await action(`${A.fund.action_url}?lang=pt`);
check('GET pt: the same three facts', describedPt.j.description.includes('DESTA missão') && describedPt.j.description.includes(`só a carteira do patrocinador (${sponsor.address}) pode aprovar`) && describedPt.j.description.includes('não para a carteira que financiou'), describedPt.j.description);
const href = described.j.links.actions[0].href;

// --- attacks on the POST ---------------------------------------------------------
const tampered = await action(href, {
  account: funder.address, amount: 1, lamports: 1, reward_lamports: 1, expires_at: '2030-01-01T00:00:00Z', expiresAt: 4102444800,
  sponsor: funder.address, approver: funder.address, refund_address: funder.address, sponsor_wallet: funder.address, bounty: B.id, slug: B.slug, escrow: viewB.escrow.address,
});
const built = tampered.http === 200 ? createOf(tampered.j.transaction, programId) : null;
check('POST: the transaction is built for the funding wallet alone', built?.payer === funder.address && built.funder === funder.address && JSON.stringify(built.signers) === JSON.stringify([funder.address]), JSON.stringify(tampered.j?.message ?? built));
check('ATTACK tampered amount/expiry: the terms are the bounty`s, not the request`s', built?.amount === BigInt(REWARD) && built.expiresAt === termsA.expiresAt, `${built?.amount} ${built?.expiresAt}`);
check('ATTACK funder as approver/refund address: sponsor and approver stay the posting wallet', built?.sponsor === sponsor.address && built.approver === sponsor.address);
check('ATTACK the link of A against B: the account is A`s, the one its page shows', built?.escrow === termsA.escrow && built.escrow !== viewB.escrow.address);
check('the transaction carries nothing but the create and its memo', built?.programs.length === 2 && built.programs[0] === programId && built.programs[1].startsWith('Memo'), JSON.stringify(built?.programs));
check('POST: an account that is not an address is refused', (await action(href, { account: 'not-a-wallet' })).http === 400);
check('POST: the escrow account itself cannot be the payer', (await action(href, { account: termsA.escrow })).http === 400);
check('POST: a wallet with no SOL is told so, nothing is built', await (async () => {
  const empty = await action(href, { account: wallet(`blink-empty-${stamp}`).address });
  return empty.http === 400 && !empty.j.transaction;
})());

// --- the funder signs and sends ----------------------------------------------------
const funderBefore = await balance(funder.address);
const fundSignature = await sendUnsigned(funder, tampered.j.transaction);
console.log('funded by the link', explorer('tx', fundSignature));
const completed = await action(tampered.j.links.next.href, { account: funder.address, signature: fundSignature });
check('the callback reports the bounty funded', completed.http === 200 && completed.j.type === 'completed' && /locked in escrow/.test(completed.j.description), JSON.stringify(completed.j));
view = await page(A.slug);
check('the bounty opened through the usual path', view.status === 'open' && view.funding?.signature === fundSignature && view.fund === null, `${view.status} ${view.funding?.signature}`);
let state = await escrowState(termsA.escrow);
check('ON CHAIN: the account holds the terms of the page, sponsor = approver = the posting wallet', state?.status === 'open' && state.id === A.id && state.sponsor === sponsor.address && state.approver === sponsor.address && state.amount === BigInt(REWARD) && state.expiresAt === termsA.expiresAt, JSON.stringify(state, (_, value) => (typeof value === 'bigint' ? String(value) : value)));
check('ON CHAIN: the only signer of the funding is the funder', JSON.stringify(await signers(fundSignature)) === JSON.stringify([funder.address]));
check('the funder paid the reward, the rent and the fee', funderBefore - (await balance(funder.address)) > REWARD);
const fundedEvent = view.events.find((event) => event.kind === 'funded');
check('the ledger names the funder as the signer, labelled funder and not sponsor', fundedEvent?.signed_by === funder.address && fundedEvent.signed_role === 'funder', JSON.stringify(fundedEvent));
check('B is untouched by A`s link', (await page(B.slug)).status === 'awaiting_funding' && (await escrowState(viewB.escrow.address)) === null);

// --- a funded bounty builds nothing ------------------------------------------------
const again = await action(`${A.fund.action_url}?lang=en`);
check('ATTACK funded: the Action is disabled', again.http === 200 && again.j.disabled === true);
check('ATTACK funded: the POST builds nothing', await (async () => {
  const answer = await action(href, { account: funder.address });
  return answer.http === 400 && !answer.j.transaction;
})());

// --- the funder is neither approver nor refund address -----------------------------
const funderSession = await login(funder);
await sql(`insert into itera.test_accounts (user_id, reason) select i.user_id, 'bounty-blink-e2e: funder' from itera.identities i where i.provider_subject = '${funderSession.authUid}' on conflict (user_id) do nothing`);
check('ATTACK the funder asks for the refund: not its bounty', (await call('bounty-post', funderSession, { action: 'refund_tx', bounty: A.id })).http === 404);
check('ATTACK the funder asks to approve: not its bounty', (await call('bounty-post', funderSession, { action: 'approve_tx', bounty: A.id })).http === 404);
const simulate = async (instruction) => {
  const message = compileMessage(funder.address, [instruction], await latestBlockhash());
  return (await rpc('simulateTransaction', [signed(funder, message), { encoding: 'base64', commitment: 'confirmed', sigVerify: false }])).value;
};
const toFunder = await simulate(refundInstruction({ programId, authority: funder.address, escrow: termsA.escrow, sponsor: funder.address }));
check('ATTACK ON CHAIN (simulated): the program refuses a refund signed by the funder to the funder', toFunder.err !== null, JSON.stringify(toFunder.err));
const toSponsor = await simulate(refundInstruction({ programId, authority: funder.address, escrow: termsA.escrow, sponsor: sponsor.address }));
check('ATTACK ON CHAIN (simulated): and one signed by the funder to the sponsor, before the expiry', toSponsor.err !== null, JSON.stringify(toSponsor.err));

// --- a learner accepts, delivers, the sponsor approves, the learner is paid -----------
check('a certified learner accepts', (await acceptBounty(a, A.id)).http === 200);
check('and delivers', (await call('bounty-claim', a, { action: 'submit', bounty: A.id, url: 'https://example.com/e2e-blink-delivery' })).j?.submitted === true);
const learnerBefore = await balance(a.address);
const approve = await call('bounty-post', sponsor, { action: 'approve_tx', bounty: A.id });
check('the payout is built for the sponsor wallet', approve.http === 200 && approve.j.pays === a.address, JSON.stringify(approve.j?.error ?? approve.j?.pays));
const payout = await send(sponsor, Buffer.from(approve.j.message_base64, 'base64'));
console.log('payout', explorer('tx', payout));
const paid = await confirmUntil(sponsor, A.id, 'paid');
check('the bounty reads paid', paid.j?.status === 'paid' && paid.j.payout_signature === payout, JSON.stringify(paid.j));
state = await escrowState(termsA.escrow);
check('ON CHAIN: paid to the learner, exactly the reward, signed by the sponsor alone', state?.status === 'paid' && state.claimant === a.address && (await balance(a.address)) - learnerBefore === REWARD && JSON.stringify(await signers(payout)) === JSON.stringify([sponsor.address]));

// --- the second one: funded by the link, refunded to the SPONSOR ---------------------
const builtB = await action(`${B.fund.action_url}?lang=en`, { account: funder.address });
const createB = builtB.http === 200 ? createOf(builtB.j.transaction, programId) : null;
check('B: its own link builds its own account', createB?.escrow === viewB.escrow.address && createB.sponsor === sponsor.address, JSON.stringify(builtB.j?.message ?? createB));
const fundB = await sendUnsigned(funder, builtB.j.transaction);
console.log('B funded by the link', explorer('tx', fundB));
await action(builtB.j.links.next.href, { account: funder.address, signature: fundB });
check('B opened', (await page(B.slug)).status === 'open');
const refund = await call('bounty-post', sponsor, { action: 'refund_tx', bounty: B.id });
check('the sponsor may take back an open bounty nobody holds', refund.http === 200, JSON.stringify(refund.j?.error ?? ''));
const sponsorBefore = await balance(sponsor.address);
const funderBeforeRefund = await balance(funder.address);
const refundSignature = await send(sponsor, Buffer.from(refund.j.message_base64, 'base64'));
console.log('B refunded', explorer('tx', refundSignature));
for (let attempt = 0; attempt < 5; attempt += 1) {
  if ((await call('bounty-post', sponsor, { action: 'confirm', bounty: B.id })).j?.status === 'refunded') break;
  await sleep(1500);
}
const stateB = await escrowState(viewB.escrow.address);
const sponsorGain = (await balance(sponsor.address)) - sponsorBefore;
check('ON CHAIN: the reward returned to the SPONSOR', stateB?.status === 'refunded' && sponsorGain >= REWARD - 10_000, `sponsor ${sponsorGain}`);
check('ON CHAIN: the funder got nothing back', (await balance(funder.address)) === funderBeforeRefund, String((await balance(funder.address)) - funderBeforeRefund));
const pageB = await page(B.slug);
check('the page reads refunded to the sponsor wallet', pageB.status === 'refunded' && pageB.refund?.wallet === sponsor.address && pageB.fund === null, JSON.stringify(pageB.refund));

// --- hidden, expired, deleted --------------------------------------------------------
const C = await post('C');
const linkC = `${C.fund.action_url}?lang=en`;
check('C: a fresh draft is fundable', (await action(linkC)).j?.disabled !== true);
await sql(`update itera.bounties set hidden_at = now(), hidden_reason = 'e2e' where id = '${C.id}'`);
check('ATTACK hidden: the Action answers as if it did not exist', (await action(linkC)).http === 404 && (await action(linkC, { account: funder.address })).http === 404);
check('ATTACK hidden: the page offers no link', (await page(C.slug)).fund === null);
await sql(`update itera.bounties set hidden_at = null, hidden_reason = null, expires_at = now() - interval '1 minute' where id = '${C.id}'`);
check('ATTACK expired: disabled, and the POST builds nothing', await (async () => {
  const read = await action(linkC);
  const answer = await action(linkC, { account: funder.address });
  return read.j?.disabled === true && answer.http === 400 && !answer.j.transaction;
})());
await sql(`update itera.bounties set expires_at = now() + interval '1 day' where id = '${C.id}'`);
check('the sponsor deletes the draft', (await call('bounty-post', sponsor, { action: 'delete', bounty: C.id })).j?.deleted === true);
check('ATTACK deleted draft: nothing to fund', (await action(linkC)).http === 404 && (await action(linkC, { account: funder.address })).http === 404);

console.log('paid page    ', `https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/${A.slug}`);
console.log('refunded page', `https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/${B.slug}`);
done();
