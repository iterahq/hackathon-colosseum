#!/usr/bin/env node
// Reproduces the attacks of the security review against the LIVE hackathon functions (Solana devnet)
// and proves each one is refused. One section per finding; run all or name the ones you want:
//
//   node scripts/hackathon/security-attacks.mjs            # every section
//   node scripts/hackathon/security-attacks.mjs a c        # only "pay once, get two" and progress
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD,
// SUPABASE_ACCESS_TOKEN (or HACKATHON_ANON_KEY). Paying wallets are throwaway keypairs funded from
// the TREASURY key (HACKATHON_TREASURY_KEYFILE, default ~/.config/itera-hackathon/devnet-treasury.json):
// what they pay goes back to the treasury, so a run costs network fees only. Sections say what
// they spend. The script stops before a section when the mint authority would go below 0.62 SOL or
// the treasury below 0.25 SOL. Leaves throwaway wallet users behind; never touches the owner's
// wallet account or the demo e-mail user.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { compactU16, base58Decode, base58Encode, buildTransferMessage, transferData, MEMO_PROGRAM, SYSTEM_PROGRAM } from '../../supabase/functions/_shared/solana-tx.ts';
import { FUNCTIONS, anonKey, balance, check, newLearner, psql, rpc, signAndSend, sol, summary, until } from './social-e2e.lib.mjs';

const AUTHORITY = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const AUTHORITY_FLOOR = 620_000_000n;
const TREASURY_FLOOR = 250_000_000n;
/** What a section may spend at most, so the floors are checked before it starts. */
const MARGIN = 10_000_000n;
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function loadTreasury() {
  const file = process.env.HACKATHON_TREASURY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-treasury.json`;
  const secret = Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secret.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  return { privateKey, address: base58Encode(secret.slice(32)) };
}

const latestBlockhash = async () => (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;

async function fundFromTreasury(context, recipient, lamports) {
  return signAndSend(context.treasury, buildTransferMessage({ payer: context.treasury.address, recipient, lamports, memo: 'security-attacks: funding', recentBlockhash: await latestBlockhash() }));
}

async function balances(context, label) {
  const now = { authority: await balance(AUTHORITY), treasury: await balance(context.treasury.address) };
  console.log(`[balances ${label}] authority ${sol(now.authority)} SOL · treasury ${sol(now.treasury)} SOL`);
  return now;
}

async function guard(context, label) {
  const now = await balances(context, `before ${label}`);
  if (now.authority - MARGIN < AUTHORITY_FLOOR) throw new Error(`STOP: the mint authority (${sol(now.authority)} SOL) is too close to its 0.62 SOL floor`);
  if (now.treasury - MARGIN < TREASURY_FLOOR) throw new Error(`STOP: the treasury (${sol(now.treasury)} SOL) is too close to its 0.25 SOL floor`);
}

const key = (address) => [...base58Decode(address, 32)];

/** One System transfer payer -> recipient followed by ONE memo instruction PER entry of `memos`. */
function buildMultiMemoMessage({ payer, recipient, lamports, memos, recentBlockhash }) {
  const transfer = transferData(lamports);
  const memoInstructions = memos.flatMap((text) => {
    const bytes = new TextEncoder().encode(text);
    return [3, ...compactU16(0), ...compactU16(bytes.length), ...bytes];
  });
  return Uint8Array.from([
    1, 0, 2,
    ...compactU16(4),
    ...key(payer), ...key(recipient), ...key(SYSTEM_PROGRAM), ...key(MEMO_PROGRAM),
    ...key(recentBlockhash),
    ...compactU16(1 + memos.length),
    2, ...compactU16(2), 0, 1, ...compactU16(transfer.length), ...transfer,
    ...memoInstructions,
  ]);
}

async function action(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

const purchaseRow = (id) => psql(`select status || '|' || coalesce(tx_signature, '') from itera.purchases where id = :'id'::uuid;`, { id }).split('|');
const giftRow = (id) => psql(`select status || '|' || coalesce(tx_signature, '') from itera.gifts where id = :'id'::uuid;`, { id }).split('|');
const ledgerRef = (signature) => psql(`select coalesce((select kind || ':' || ref_id from itera.payments where tx_signature = :'signature'), '');`, { signature });
const livesOf = (userId) => psql(`select coalesce((select lives::text from itera.companions where user_id = :'user_id'::uuid), '');`, { user_id: userId });

// --- A. Finding 2: pay once, get two --------------------------------------------------------------
// Spends: two network fees of a throwaway wallet + one funding fee of the treasury. No mint.
async function payOnceGetTwo(context) {
  const { apikey, treasury } = context;
  const PRICE = 1_100_000n;
  const attacker = await newLearner(apikey, 'A attacker');
  const victim = await newLearner(apikey, 'A recipient of the gift');
  await fundFromTreasury(context, attacker.address, 2n * (PRICE + 5_000n));

  const intent = await attacker.call('purchase-intent', { item_key: 'outfit_glasses' });
  const otherIntent = await attacker.call('purchase-intent', { item_key: 'outfit_headphones' });
  const post =await action(`${FUNCTIONS}/action-gift?to=${victim.address}`, { account: attacker.address });
  const giftId = post.status === 200 ? new URL(post.body.links.next.href).searchParams.get('gift') : null;
  const purchaseId = intent.body.intent_id;
  check('A setup: a purchase intent and an Action gift are open for the same paying wallet', intent.status === 200 && post.status === 200 && Boolean(giftId) && giftId !== purchaseId, `${intent.status} ${post.status}`);
  const livesBefore = livesOf(victim.userId);

  // The attack of the review: ONE transfer of the higher price, the memos of BOTH intents.
  const attack = buildMultiMemoMessage({ payer: attacker.address, recipient: treasury.address, lamports: PRICE, memos: [purchaseId, giftId], recentBlockhash: await latestBlockhash() });
  const wire = Buffer.from([1, ...sign(null, Buffer.from(attack), attacker.privateKey), ...attack]);
  const submitted = await attacker.call('purchase-submit', { intent_id: purchaseId, signed_transaction: wire.toString('base64') });
  check('A purchase-submit: the two-memo transaction is refused BEFORE it is broadcast (422 payment_mismatch memo)', submitted.status === 422 && submitted.body.error === 'payment_mismatch' && submitted.body.detail === 'memo', JSON.stringify(submitted.body));

  const attackSignature = await signAndSend(attacker, attack);
  console.log(`A two-memo transaction on chain: ${attackSignature}`);
  const confirmPurchase = await until(() => attacker.call('purchase-confirm', { intent_id: purchaseId, signature: attackSignature }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  check('A purchase-confirm with the two-memo payment: refused (422 payment_mismatch memo)', confirmPurchase.status === 422 && confirmPurchase.body.detail === 'memo', JSON.stringify(confirmPurchase.body));
  const confirmGift = await until(() => action(post.body.links.next.href, { account: attacker.address, signature: attackSignature }), (answer) => answer.status !== 404, 6, 1500);
  check('A action-gift/confirm with the SAME signature: refused (422), no life given', confirmGift.status === 422 && typeof confirmGift.body.message === 'string', `${confirmGift.status} ${JSON.stringify(confirmGift.body)}`);
  // The reconcile finds the gift id among the payer's memos and tries the same settlement.
  await action(`${FUNCTIONS}/action-gift?to=${victim.address}`, { account: attacker.address });
  check('A after confirm, callback and reconcile: purchase pending, gift pending, no ledger entry, recipient unchanged', purchaseRow(purchaseId)[0] === 'pending' && giftRow(giftId)[0] === 'pending' && ledgerRef(attackSignature) === '' && livesOf(victim.userId) === livesBefore, `${purchaseRow(purchaseId)[0]} ${giftRow(giftId)[0]} ledger="${ledgerRef(attackSignature)}"`);

  // An honest payment of the purchase, then the same signature offered to the gift.
  const again = await attacker.call('purchase-intent', { item_key: 'outfit_glasses' });
  const honest = await signAndSend(attacker, Buffer.from(again.body.message_base64, 'base64'));
  const startedAt = Date.now();
  const paid = await until(() => attacker.call('purchase-confirm', { intent_id: again.body.intent_id, signature: honest }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  check('A an honest one-memo payment still settles the purchase', again.body.intent_id === purchaseId && paid.status === 200 && paid.body.status === 'paid' && ledgerRef(honest) === `purchase:${purchaseId}`, `${paid.status} ${JSON.stringify(paid.body).slice(0, 120)} ledger=${ledgerRef(honest)}`);
  console.log(`A purchase-confirm answered in ${Date.now() - startedAt} ms · circuit ${JSON.stringify(paid.body.circuit ?? null)}`);
  const reuse = await action(post.body.links.next.href, { account: attacker.address, signature: honest });
  check('A the paid signature offered to the gift: 409 signature reused', reuse.status === 409, `${reuse.status} ${JSON.stringify(reuse.body)}`);
  const ledger = psql(`select itera.settle_payment('gift', :'gift'::uuid, :'signature', 550000);`, { gift: giftId, signature: honest });
  check('A the ledger itself (verification skipped on purpose): signature_reused, gift still pending', ledger === 'signature_reused' && giftRow(giftId)[0] === 'pending' && livesOf(victim.userId) === livesBefore, ledger);
  const crossPurchase = await attacker.call('purchase-confirm', { intent_id: otherIntent.body.intent_id, signature: honest });
  check('A the paid signature offered to a second purchase: 409 signature_reused', otherIntent.status === 200 && crossPurchase.status === 409 && crossPurchase.body.error === 'signature_reused' && purchaseRow(otherIntent.body.intent_id)[0] === 'pending', `${crossPurchase.status} ${JSON.stringify(crossPurchase.body)}`);
}

const SECTIONS = {
  a: ['A. pay once, get two (finding 2)', payOnceGetTwo],
};

async function main() {
  const wanted = process.argv.slice(2).map((name) => name.toLowerCase());
  const names = wanted.length > 0 ? wanted : Object.keys(SECTIONS);
  const unknown = names.filter((name) => !SECTIONS[name]);
  if (unknown.length > 0) throw new Error(`unknown section(s): ${unknown.join(', ')} (known: ${Object.keys(SECTIONS).join(', ')})`);

  const context = { apikey: await anonKey(), treasury: loadTreasury() };
  const before = await balances(context, 'start');
  for (const name of names) {
    const [title, run] = SECTIONS[name];
    console.log(`\n=== ${title} ===`);
    await guard(context, title);
    await run(context);
    await balances(context, `after ${title}`);
  }
  const after = await balances(context, 'end');
  console.log(`\nauthority: ${sol(before.authority)} -> ${sol(after.authority)} SOL (${sol(after.authority - before.authority)})`);
  console.log(`treasury:  ${sol(before.treasury)} -> ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
  const { total, failed } = summary();
  console.log(`\n${total - failed.length}/${total} checks passed${failed.length ? `\nFAILED:\n  ${failed.join('\n  ')}` : ''}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('security-attacks failed:', error);
  process.exit(1);
});
