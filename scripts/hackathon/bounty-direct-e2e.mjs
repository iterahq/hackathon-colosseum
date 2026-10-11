#!/usr/bin/env node
// End-to-end check of a DIRECT bounty (a reward locked for one invited wallet) on the hackathon project
// and Solana devnet. An outside wallet posts a bounty addressed to learner A and funds it. Learner B,
// who holds the certification the bounty asks for, is refused by the API (`not_invited`) and then sends
// `accept` straight to the escrow program, which refuses it itself (`NotInvited`, 6020), with or without
// Itera's attester co-signing. A accepts, delivers, the sponsor's wallet approves, A is paid. The public
// board never lists the bounty; `bounty-board/invited/<A>` does. A second direct bounty is left to run
// past its date and the public sweep returns its reward to the sponsor.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   RUN=<label of a bounty-e2e.mjs run whose learners are certified> node scripts/hackathon/bounty-direct-e2e.mjs
//
// Needs two learners already certified by `bounty-e2e.mjs` (wallets `a-<RUN>` and `d-<RUN>`, both with at
// least one stamped day of Week 1). Gives a throwaway sponsor wallet 0.05 devnet SOL from the authority.
// The sponsor and both learners are tagged BY ID in `itera.test_accounts`. The paid and the refunded
// bounty end marked `is_test`. KEEP_OPEN=1 posts a third one for A and leaves it open (not `is_test`,
// labelled as the team's own through its sponsor) so the pages have a live direct bounty to show.
import { compileMessage } from '../../supabase/functions/_shared/solana-message.ts';
import { ESCROW_ERRORS, DIRECT_ESCROW_STATE_BYTES, acceptInstruction, escrowPda, parseEscrowState } from '../../supabase/functions/_shared/bounty-program.ts';
import { buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { acceptBounty, balance, call, check, done, explorer, get, latestBlockhash, loadAuthority, loadTreasury, login, rpc, send, signedBy, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const UNIT = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const REWARD = 10_000_000;
const RUN = process.env.RUN;
if (!RUN) throw new Error('RUN is not set: the label of a bounty-e2e.mjs run whose learners hold a certification');
const stamp = Date.now().toString(36);

/** The sponsor's calls share one write budget (20 a minute): a throttled call waits and goes again. */
const post = async (who, body) => {
  for (let attempt = 0; ; attempt += 1) {
    const answer = await call('bounty-post', who, body);
    if (answer.http !== 429 || attempt >= 3) return answer;
    await sleep(20_000);
  }
};
const accountInfo = async (address) => (await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }])).value;
const escrowState = async (address) => {
  const info = await accountInfo(address);
  return info ? parseEscrowState(Uint8Array.from(Buffer.from(info.data[0], 'base64'))) : null;
};
const signers = async (signature) => {
  const tx = await rpc('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  return tx.transaction.message.accountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures);
};
/** What the program answers to these instructions, signatures verified, nothing sent. `signers[0]` pays the fee. */
const simulate = async (by, instructions) => {
  const message = compileMessage(by[0].address, instructions, await latestBlockhash());
  const { value } = await rpc('simulateTransaction', [signedBy(by, message), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }]);
  if (!value.err) return 'ok';
  const custom = value.err.InstructionError?.[1]?.Custom;
  return custom !== undefined ? `${custom}:${ESCROW_ERRORS[custom] ?? '?'}` : JSON.stringify(value.err);
};
const confirmUntil = async (who, bounty, want) => {
  let answer = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    answer = await post(who, { action: 'confirm', bounty, note: 'e2e: approved' });
    if (answer.j?.status === want) break;
    await sleep(1500);
  }
  return answer;
};
const page = async (slug) => (await get(`bounty-board/${slug}?lang=en`)).j;
const board = async () => (await get('bounty-board?lang=en')).j;
const invited = async (address) => (await get(`bounty-board/invited/${address}?lang=en`)).j;
const onBoard = async (id) => (await board()).bounties.some((bounty) => bounty.id === id);
const form = (label, extra) => ({
  action: 'create', sponsor_name: `E2E Direct ${stamp}`,
  title: { en: `E2E direct bounty ${label} ${stamp}` },
  summary: { en: 'Automated test of a bounty addressed to one invited wallet and held by the escrow program.' },
  brief: { en: 'Context: an automated end-to-end run. What to do: deliver any https link; the script that posted this approves it.' },
  deliverable: { en: 'An https link to the page.' },
  reward_lamports: REWARD, unit_id: UNIT, min_days: 1, expires_in_days: 1, claim_hours: 1,
  ...extra,
});
const tag = (learner, reason) =>
  sql(`insert into itera.test_accounts (user_id, reason) select i.user_id, 'bounty-direct-e2e: ${reason}' from itera.identities i where i.provider_subject = '${learner.authUid}' on conflict (user_id) do nothing`);
const fund = async (who, id) => {
  const tx = await post(who, { action: 'fund_tx', bounty: id });
  if (tx.http !== 200) throw new Error(`fund_tx: ${JSON.stringify(tx.j)}`);
  const signature = await send(who, Buffer.from(tx.j.message_base64, 'base64'));
  return { signature, rent: tx.j.rent_lamports, status: (await confirmUntil(who, id, 'open')).j?.status };
};

const authority = loadAuthority();
const treasury = loadTreasury();
const sponsor = await login(wallet(`direct-sponsor-${stamp}`));
const a = await login(wallet(`a-${RUN}`));
const b = await login(wallet(`d-${RUN}`));
console.log('sponsor', sponsor.address, '\nA (invited)', a.address, '\nB (eligible, not invited)', b.address);
await tag(sponsor, 'sponsor');
await tag(a, 'invited learner');
await tag(b, 'learner that was not invited');
await send(authority, buildTransferMessage({ payer: authority.address, recipient: sponsor.address, lamports: 50_000_000n, memo: 'e2e: direct sponsor top-up', recentBlockhash: await latestBlockhash() }));

// --- before posting: who is this wallet, can it accept --------------------------
const options = (await get('bounty-post')).j;
check('the form is told the program has direct bounties, and what their account costs', options.direct === true && options.limits.direct_escrow_rent_lamports > options.limits.escrow_rent_lamports, JSON.stringify(options.limits));
const aboutA = await post(sponsor, { action: 'invitee_check', wallet: a.address, unit_id: UNIT, min_days: 1 });
check('pre-post read: A is a learner wallet and holds the days', aboutA.http === 200 && aboutA.j.known_learner === true && aboutA.j.eligible === true && Boolean(aboutA.j.proof?.asset), JSON.stringify(aboutA.j));
const aboutB = await post(sponsor, { action: 'invitee_check', wallet: b.address, unit_id: UNIT, min_days: 1 });
check('pre-post read: B holds the same certification (eligible for an open bounty with these terms)', aboutB.j?.eligible === true && Boolean(aboutB.j.proof?.asset), JSON.stringify(aboutB.j));
const tooMuch = await post(sponsor, { action: 'invitee_check', wallet: a.address, unit_id: UNIT, min_days: 5 });
check('pre-post read: more days than A stamped says so', tooMuch.http === 200 && tooMuch.j.eligible === false && tooMuch.j.reason === 'not_enough_days', JSON.stringify(tooMuch.j));
const unknown = await post(sponsor, { action: 'invitee_check', wallet: wallet(`direct-nobody-${stamp}`).address, unit_id: UNIT, min_days: 1 });
check('pre-post read: a wallet Itera never saw is not a learner and not eligible', unknown.j?.known_learner === false && unknown.j.eligible === false && unknown.j.reason === 'no_certification', JSON.stringify(unknown.j));
check('pre-post read: the sponsor own wallet is refused', (await post(sponsor, { action: 'invitee_check', wallet: sponsor.address, unit_id: UNIT, min_days: 1 })).j?.error === 'own_invitee');
check('pre-post read: not an address is refused', (await post(sponsor, { action: 'invitee_check', wallet: 'not-a-wallet', unit_id: UNIT, min_days: 1 })).j?.error === 'invalid_invitee');
check('posting a direct bounty to yourself is refused', (await post(sponsor, form('self', { invitee_wallet: sponsor.address }))).j?.error === 'own_invitee');
check('posting one to something that is not a wallet is refused', (await post(sponsor, form('bad', { invitee_wallet: 'https://evil.example/x' }))).j?.error === 'invalid_invitee');

// --- the direct bounty ------------------------------------------------------------
const directBefore = (await board()).stats;
const created = await post(sponsor, form('paid', { invitee_wallet: a.address }));
check('a wallet posts a direct bounty for A, and is told A can accept it today', created.http === 200 && created.j.direct === true && created.j.invitee_wallet === a.address && created.j.invitee_eligible === true && created.j.invite_enforced_by === 'program', JSON.stringify(created.j));
const { id, slug } = created.j;
check('unfunded, it is in nobody inbox', !(await invited(a.address)).bounties.some((bounty) => bounty.id === id));
const funded = await fund(sponsor, id);
console.log('create_direct', explorer('tx', funded.signature));
check('the sponsor wallet funds it: the bounty opens', funded.status === 'open', funded.signature);
let view = await page(slug);
const escrow = view.escrow.address;
console.log('escrow account', explorer('address', escrow));
const info = await accountInfo(escrow);
let state = await escrowState(escrow);
check('ON CHAIN: a 260-byte account of the escrow program, tag 3', info?.owner === options.program_id && Buffer.from(info.data[0], 'base64').length === DIRECT_ESCROW_STATE_BYTES && Buffer.from(info.data[0], 'base64')[0] === 3);
check('ON CHAIN: it names the invitee, the days and the sponsor as approver', state?.status === 'open' && state.invitee === a.address && state.gate?.minDays === 1 && state.approver === sponsor.address && state.sponsor === sponsor.address && state.amount === BigInt(REWARD), JSON.stringify({ ...state, amount: String(state?.amount) }));
const terms = { bountyId: id, sponsor: sponsor.address, approver: sponsor.address, collection: state.collection, amount: BigInt(REWARD), expiresAt: state.expiresAt, gate: state.gate };
check('ON CHAIN: the address commits to the invitee (other invitee or none: another address)', (await escrowPda(options.program_id, { ...terms, invitee: a.address })) === escrow && (await escrowPda(options.program_id, { ...terms, invitee: b.address })) !== escrow && (await escrowPda(options.program_id, terms)) !== escrow);
check('the page of the bounty is public and says it is direct, for whom, enforced by the program', view.direct === true && view.invitee_wallet === a.address && view.invite_enforced_by === 'program' && view.status === 'open', JSON.stringify({ direct: view.direct, invitee: view.invitee_wallet, by: view.invite_enforced_by, status: view.status }));
check('the public board does not list it (open)', !(await onBoard(id)));
const directOpen = (await board()).stats;
check('its money is counted under its own figure, as the team own test', directOpen.direct_open === directBefore.direct_open + 1 && directOpen.direct_locked_lamports === directBefore.direct_locked_lamports + REWARD && directOpen.direct_team_test === directBefore.direct_team_test + 1, JSON.stringify({ before: directBefore.direct_open, after: directOpen.direct_open, locked: directOpen.direct_locked_sol }));
let inbox = await invited(a.address);
check('the inbox of A lists it, open', inbox.bounties.some((bounty) => bounty.id === id && bounty.status === 'open' && bounty.direct === true) && inbox.open_count >= 1, JSON.stringify(inbox.bounties.map((bounty) => [bounty.slug, bounty.status])));
check('the inbox of B does not', !(await invited(b.address)).bounties.some((bounty) => bounty.id === id));

// --- B, eligible and not invited: refused by the API, then by the program itself ---
const statusB = await call('bounty-claim', b, { action: 'status', bounty: id });
check('B asks where it stands: 403 not_invited', statusB.http === 403 && statusB.j.error === 'not_invited' && statusB.j.reason === 'not_invited' && statusB.j.eligible === false, JSON.stringify(statusB.j));
const prepareB = await call('bounty-claim', b, { action: 'accept_prepare', bounty: id });
check('B asks the API to accept: 403 not_invited, no transaction offered', prepareB.http === 403 && prepareB.j.error === 'not_invited' && prepareB.j.sign === undefined, JSON.stringify(prepareB.j));
const certA = aboutA.j.proof.asset;
const certB = aboutB.j.proof.asset;
const accept = (claimant, certification, attester = sponsor.address, gated = true) => acceptInstruction({ programId: options.program_id, attester, escrow, claimant, certification, gated });
const refusedB = await simulate([sponsor, b], [accept(b.address, certB)]);
check('B sends accept straight to the program with its own valid certification: PROGRAM refuses, NotInvited (6020)', refusedB === '6020:not_invited', refusedB);
const refusedAttested = await simulate([treasury, b], [accept(b.address, certB, treasury.address, false)]);
check('PROGRAM refuses B even with the Itera attester co-signing', refusedAttested === '6020:not_invited', refusedAttested);
const refusedBorrowed = await simulate([sponsor, b], [accept(b.address, certA)]);
check('PROGRAM refuses B presenting the certification of A', refusedBorrowed === '6020:not_invited', refusedBorrowed);
const control = await simulate([sponsor, a], [accept(a.address, certA)]);
check('control: the very same instruction signed by A would pass', control === 'ok', control);
let sent = null;
try {
  sent = await rpc('sendTransaction', [signedBy([sponsor, b], compileMessage(sponsor.address, [accept(b.address, certB)], await latestBlockhash())), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
} catch (error) {
  sent = String(error.message);
}
check('the node will not even take the transaction of B: custom program error 0x1784 (6020)', /0x1784/.test(sent), sent);
state = await escrowState(escrow);
check('ON CHAIN: still open, nobody recorded', state?.status === 'open' && state.claimant === null);

// --- A: invited ---------------------------------------------------------------------
const statusA = await call('bounty-claim', a, { action: 'status', bounty: id });
check('A asks where it stands: eligible', statusA.http === 200 && statusA.j.eligible === true && statusA.j.error === undefined, JSON.stringify(statusA.j).slice(0, 200));
const accepted = await acceptBounty(a, id);
check('A accepts with its own signature', accepted.http === 200 && accepted.j.accepted === true, JSON.stringify(accepted.j).slice(0, 240));
if (accepted.j?.chain?.signature) console.log('accept', explorer('tx', accepted.j.chain.signature));
state = await escrowState(escrow);
check('ON CHAIN: held by A, the invitee', state?.status === 'claimed' && state.claimant === a.address && state.invitee === a.address);
check('ON CHAIN: the accept carries the signature of A', accepted.j?.chain?.signature ? (await signers(accepted.j.chain.signature)).includes(a.address) : false);
check('the public board does not list it (held)', !(await onBoard(id)));
check('A delivers', (await call('bounty-claim', a, { action: 'submit', bounty: id, url: 'https://example.com/e2e-direct' })).j?.submitted === true);
const before = await balance(a.address);
const treasuryBefore = await balance(treasury.address);
const approve = await post(sponsor, { action: 'approve_tx', bounty: id });
check('the payout is built for the sponsor wallet and pays A', approve.http === 200 && approve.j.pays === a.address, JSON.stringify(approve.j?.error ?? approve.j?.pays));
const payout = await send(sponsor, Buffer.from(approve.j.message_base64, 'base64'));
console.log('payout', explorer('tx', payout));
const paid = await confirmUntil(sponsor, id, 'paid');
check('the bounty reads paid, with the sponsor own transaction', paid.j?.status === 'paid' && paid.j.payout_signature === payout, JSON.stringify(paid.j));
state = await escrowState(escrow);
check('ON CHAIN: paid to A, exactly the reward', state?.status === 'paid' && state.claimant === a.address && (await balance(a.address)) - before === REWARD, String((await balance(a.address)) - before));
check('ON CHAIN: the only signer of the payout is the sponsor wallet; the treasury did not move', JSON.stringify(await signers(payout)) === JSON.stringify([sponsor.address]) && (await balance(treasury.address)) === treasuryBefore);
view = await page(slug);
check('the page shows the payout, still direct', view.status === 'paid' && view.payout?.signature === payout && view.direct === true && view.rehearsal === true);
check('the public board never listed it (paid)', !(await onBoard(id)));
const directPaid = (await board()).stats;
check('the counters moved it from open to paid, under the direct figures', directPaid.direct_paid === directBefore.direct_paid + 1 && directPaid.direct_open === directBefore.direct_open, JSON.stringify({ direct_paid: directPaid.direct_paid, paid_count: directPaid.paid_count }));
inbox = await invited(a.address);
check('the inbox of A shows it paid', inbox.bounties.some((bounty) => bounty.id === id && bounty.status === 'paid'));
check('what A earned counts it, verified on chain', (await get(`bounty-board/wallet/${a.address}`)).j.items.some((item) => item.signature === payout && item.verified));
await sql(`update itera.bounties set is_test = true where id = '${id}'`);

// --- a direct bounty nobody takes: past its date the public sweep returns it ---------
const second = await post(sponsor, form('expiring', { invitee_wallet: a.address }));
check('a second direct bounty is posted', second.http === 200 && second.j.direct === true, JSON.stringify(second.j));
// The form allows no deadline under a day: the row is given two minutes and the address those terms derive, before any money moves.
const expiresAt = Math.floor(Date.now() / 1000) + 120;
const shortEscrow = await escrowPda(options.program_id, { ...terms, bountyId: second.j.id, expiresAt, invitee: a.address });
await sql(`update itera.bounties set expires_at = to_timestamp(${expiresAt}), escrow_address = '${shortEscrow}', is_test = true where id = '${second.j.id}' and status = 'awaiting_funding'`);
const secondFund = await fund(sponsor, second.j.id);
check('it is funded and open, two minutes from its date', secondFund.status === 'open', secondFund.signature);
state = await escrowState(shortEscrow);
check('ON CHAIN: a direct account for A that expires in two minutes', state?.status === 'open' && state.invitee === a.address && state.expiresAt === expiresAt);
const sponsorBefore = await balance(sponsor.address);
await sleep(Math.max(0, expiresAt * 1000 - Date.now()) + 20_000);
check('past its date A is refused by the program too (expired)', (await simulate([sponsor, a], [acceptInstruction({ programId: options.program_id, attester: sponsor.address, escrow: shortEscrow, claimant: a.address, certification: certA, gated: true })])) === '6007:expired');
let swept = null;
for (let attempt = 0; attempt < 10 && swept?.status !== 'refunded'; attempt += 1) {
  const answer = await get('bounty-board/sweep');
  if (attempt === 0) check('the public sweep takes the call', answer.http === 202 && answer.j.sweeping === true);
  await sleep(8_000);
  swept = await page(second.j.slug);
}
check('the sweep refunded the expired direct bounty', swept?.status === 'refunded' && Boolean(swept.refund?.signature), JSON.stringify({ status: swept?.status, refund: swept?.refund?.signature }));
if (swept?.refund?.signature) console.log('refund by the sweep', explorer('tx', swept.refund.signature));
state = await escrowState(shortEscrow);
check('ON CHAIN: refunded, and the reward is back in the sponsor wallet', state?.status === 'refunded' && (await balance(sponsor.address)) - sponsorBefore === REWARD, String((await balance(sponsor.address)) - sponsorBefore));
check('ON CHAIN: the sponsor did not sign that refund (the expiry let Itera key send it home)', swept?.refund?.signature ? !(await signers(swept.refund.signature)).includes(sponsor.address) : false);

// --- one left open for the pages -------------------------------------------------------
if (process.env.KEEP_OPEN === '1') {
  const kept = await post(sponsor, {
    ...form('open', { invitee_wallet: a.address }),
    sponsor_name: 'Demo sponsor (team test)',
    title: { en: 'Accessible opening-hours table for our bakery', pt: 'Tabela acessível de horários da nossa padaria' },
    summary: { en: 'Turn our photographed opening hours into an HTML table a screen reader can read.', pt: 'Transforme a foto dos nossos horários numa tabela HTML que um leitor de tela consiga ler.' },
    brief: {
      en: 'Context: our opening hours are a photo on the door. What to do: one HTML table with a caption, header cells and the seven days of the week.',
      pt: 'Contexto: nossos horários são uma foto na porta. O que fazer: uma tabela HTML com legenda, células de cabeçalho e os sete dias da semana.',
    },
    deliverable: { en: 'A public link to the page (CodePen or GitHub Pages).', pt: 'Um link público para a página (CodePen ou GitHub Pages).' },
    expires_in_days: 7, claim_hours: 48,
  });
  check('a third direct bounty for A is posted', kept.http === 200, JSON.stringify(kept.j));
  const keptFund = await fund(sponsor, kept.j.id);
  check('and left OPEN for the pages', keptFund.status === 'open' && (await invited(a.address)).bounties.some((bounty) => bounty.id === kept.j.id && bounty.status === 'open'));
  console.log('LEFT OPEN', JSON.stringify({ id: kept.j.id, slug: kept.j.slug, invitee: a.address, invitee_key: `a-${RUN}`, sponsor: sponsor.address, sponsor_key: sponsor.name, fund: explorer('tx', keptFund.signature) }));
}
console.log('page', `https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/${slug}`);
done();
