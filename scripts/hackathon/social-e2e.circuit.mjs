// Feature 4: "Circuito" — each paid purchase moves half of its lamports treasury -> mint authority, publicly counted.
import { FUNCTIONS, SUPABASE_URL, check, fund, newLearner, psql, publicGet, rpc, signAndSend, until } from './social-e2e.lib.mjs';

const PRICE = 1_100_000;
const SHARE = 550_000;

async function buy(buyer, itemKey, extraConfirmFields = {}) {
  const intent = await buyer.call('purchase-intent', { item_key: itemKey });
  if (intent.status !== 200) return { intent, confirmed: null, signature: null };
  const signature = await signAndSend(buyer, Buffer.from(intent.body.message_base64, 'base64'));
  const confirmed = await until(() => buyer.call('purchase-confirm', { intent_id: intent.body.intent_id, signature, lang: 'en', ...extraConfirmFields }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  return { intent, confirmed, signature };
}

const circuitRow = (id) => psql(`select coalesce(circuit_status, '') || '|' || coalesce(circuit_lamports, 0) || '|' || coalesce(circuit_signature, '') from itera.purchases where id = :'id'::uuid;`, { id }).split('|');
const settledRow = (id) => until(async () => circuitRow(id), ([status]) => status === 'sent' || status === 'skipped' || status === 'failed', 20, 1500);

/** The transfers in a confirmed transaction, and its memo. */
async function readTransfer(signature) {
  const transaction = await until(() => rpc('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]), Boolean, 10, 1500);
  const instructions = transaction?.transaction?.message?.instructions ?? [];
  const transfer = instructions.find((entry) => entry.program === 'system' && entry.parsed?.type === 'transfer')?.parsed?.info;
  const memo = instructions.find((entry) => entry.program === 'spl-memo')?.parsed;
  const signer = transaction?.transaction?.message?.accountKeys?.find((key) => key.signer)?.pubkey;
  return { transfer, memo, signer, err: transaction?.meta?.err ?? null, count: instructions.filter((entry) => entry.program === 'system').length };
}

export async function circuit(context) {
  const { apikey, authority, treasury } = context;
  const buyer = await newLearner(apikey, 'buyer');
  await fund(authority, buyer.address, 3_400_000n);
  const before = (await publicGet(`circuit?t=${Date.now()}`)).body;
  check('circuit (public, no token): totals, addresses and explorer links', typeof before.total_lamports === 'number' && before.treasury === treasury && before.authority === authority.address && /explorer\.solana\.com\/address\//.test(before.treasury_explorer_url) && Array.isArray(before.recent), JSON.stringify(before).slice(0, 200));
  check('circuit: stamps_funded = floor(total / 5000) and cents at the pinned rate', before.stamps_funded === Math.floor(before.total_lamports / 5000) && before.total_usd_cents === Math.floor(before.total_lamports / 55000));

  const unpaid = await buyer.call('purchase-intent', { item_key: 'outfit_crown' });
  const first = await buy(buyer, 'outfit_glasses');
  check('purchase paid as before (existing answer intact)', first.confirmed?.status === 200 && first.confirmed.body.status === 'paid' && first.confirmed.body.inventory?.some((entry) => entry.item_key === 'outfit_glasses'), JSON.stringify(first.confirmed?.body).slice(0, 160));
  const purchaseId = first.intent.body.intent_id;
  const [status, lamports, signature] = await settledRow(purchaseId);
  check('purchase row: circuit sent, 50% of the lamports stored at intent time', status === 'sent' && Number(lamports) === SHARE && signature.length > 40, `${status} ${lamports}`);
  const answer = first.confirmed.body.circuit;
  check('purchase-confirm carries `circuit` (sent with its transaction, or pending while it lands)', answer && (answer.status === 'pending' || (answer.status === 'sent' && answer.lamports === SHARE && answer.stamps_funded === 110 && answer.tx_signature === signature)), JSON.stringify(answer ?? null));

  const sent = await readTransfer(signature);
  check('on chain: ONE System transfer treasury -> mint authority of exactly the share', sent.err === null && sent.count === 1 && sent.transfer?.source === treasury && sent.transfer.destination === authority.address && Number(sent.transfer.lamports) === SHARE, JSON.stringify(sent.transfer ?? null));
  check('on chain: signed by the treasury key, memo circuit:<purchase id>', sent.signer === treasury && sent.memo === `circuit:${purchaseId}`, `${sent.signer} ${sent.memo}`);

  const replay = await buyer.call('purchase-confirm', { intent_id: purchaseId, signature: first.signature, lang: 'en' });
  check('repeating the confirm: same circuit transaction, nothing new', replay.status === 200 && replay.body.circuit?.status === 'sent' && replay.body.circuit.tx_signature === signature && circuitRow(purchaseId)[2] === signature, JSON.stringify(replay.body.circuit ?? null));
  const many = await Promise.all([1, 2, 3].map(() => buyer.call('purchase-confirm', { intent_id: purchaseId, signature: first.signature })));
  const memos = await rpc('getSignaturesForAddress', [treasury, { limit: 40 }]);
  check('three concurrent repeats: still exactly one transfer with that memo on chain', many.every((entry) => entry.status === 200) && memos.filter((entry) => (entry.memo ?? '').includes(`circuit:${purchaseId}`)).length === 1);

  // Nothing in a request can move the amount or the destination.
  const second = await buy(buyer, 'outfit_headphones', { circuit_lamports: 999_999_999, lamports: 999_999_999, recipient: buyer.address, destination: buyer.address, circuit: { lamports: 999_999_999, to: buyer.address } });
  const secondId = second.intent?.body?.intent_id;
  const [secondStatus, secondLamports, secondSignature] = secondId ? await settledRow(secondId) : [];
  const secondSent = secondSignature ? await readTransfer(secondSignature) : {};
  check('NEGATIVE amount and recipient sent in the body are ignored: half of the row, to the authority', second.confirmed?.status === 200 && secondStatus === 'sent' && Number(secondLamports) === SHARE && secondSent.transfer?.destination === authority.address && Number(secondSent.transfer?.lamports) === SHARE, `${secondStatus} ${secondLamports} -> ${secondSent.transfer?.destination}`);

  check('an intent that is not paid moves nothing', unpaid.status === 200 && circuitRow(unpaid.body.intent_id)[0] === '', JSON.stringify(unpaid.body).slice(0, 80));
  check('a free claim never moves anything', psql(`select count(*) from itera.purchases where source = 'claim' and circuit_status is not null;`) === '0');
  const patch = await fetch(`${SUPABASE_URL}/rest/v1/purchases?id=eq.${purchaseId}`, { method: 'PATCH', headers: { ...buyer.headers, 'Content-Profile': 'itera', Prefer: 'return=representation' }, body: JSON.stringify({ circuit_status: null }) });
  check('NEGATIVE the buyer cannot reset the circuit state of their own purchase (no write grant)', patch.status >= 400 && circuitRow(purchaseId)[0] === 'sent', patch.status);

  const after = (await until(() => publicGet(`circuit?wallet=${buyer.address}&t=${Date.now()}`), (entry) => entry.body.total_lamports >= before.total_lamports + 2 * SHARE, 10, 2000)).body;
  check('circuit: the totals grew by exactly the two shares', after.total_lamports === before.total_lamports + 2 * SHARE && after.purchases === before.purchases + 2 && after.stamps_funded === Math.floor(after.total_lamports / 5000), `${before.total_lamports} -> ${after.total_lamports}`);
  check('circuit: recent lists the transfers with explorer links', after.recent.length >= 2 && after.recent.some((entry) => entry.tx_signature === signature && entry.lamports === SHARE && /explorer\.solana\.com\/tx\//.test(entry.explorer_url)) && Object.keys(after.recent[0]).sort().join() === 'at,explorer_url,lamports,tx_signature');
  check('circuit?wallet=: what this wallet\'s own purchases paid forward', after.wallet?.lamports === 2 * SHARE && after.wallet.stamps_funded === 220, JSON.stringify(after.wallet ?? null));
  check('circuit carries no id of anyone', !JSON.stringify(after).includes(buyer.userId) && !JSON.stringify(after).includes(purchaseId));
  const bad = await publicGet('circuit?wallet=not-a-wallet');
  check('circuit with a malformed wallet: 400', bad.status === 400 && bad.body.error === 'invalid_address');
  const post = await fetch(`${FUNCTIONS}/circuit`, { method: 'POST' });
  check('circuit is read only: POST 405', post.status === 405);

  const profile = await publicGet(`learner-profile/${buyer.address}?t=${Date.now()}`);
  check('learner-profile: circuit { lamports, stamps_funded } for that wallet', profile.body.circuit?.lamports === 2 * SHARE && profile.body.circuit.stamps_funded === 220, JSON.stringify(profile.body.circuit ?? null));
  const stranger = await publicGet(`learner-profile/${authority.address}?t=${Date.now()}`);
  check('learner-profile of a wallet that bought nothing: circuit is zero', stranger.body.circuit?.lamports === 0 && stranger.body.circuit.stamps_funded === 0);
  void PRICE;
}
