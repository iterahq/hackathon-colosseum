#!/usr/bin/env node
// End-to-end check of the Tera NFT on the hackathon project and Solana devnet: the day chest (a Tera
// EARNED by a stamped day) and the sponsor Tera (a branded prize on a bounty).
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   node scripts/hackathon/tera-e2e.mjs            # PART=chest | sponsor | all (default all)
//
// CHEST. A throwaway learner stamps day 1: the script reads the commitment `chest:1` from the
// certification asset AND from the stamp transaction, checks it landed before the slot it names,
// settles the chest, then recomputes the roll on its own from the RPC (the block at the committed slot)
// and the published pool, and must get the same Tera. The minted asset must be frozen and carry the
// origin. Then it tries to break the design: a client that sends a tier, a replayed settle, settles
// racing, a settle before the committed slot exists, a learner who holds every Tera of a tier, the kill
// switch off, a day never stamped, somebody else's day.
//
// SPONSOR. A throwaway wallet funded from the treasury posts a bounty with a prize Tera, funds it, the
// learner delivers, the sponsor approves: the payout mints the branded Tera, frozen, to the paid wallet.
//
// Spends about 0.03 devnet SOL of the mint authority and moves 0.06 SOL from the treasury to the
// throwaway sponsor (the unspent part is sent back). Refuses to start when the authority would end
// below 0.62 SOL or the treasury below 0.25 SOL. Every account it creates is tagged in
// `itera.test_accounts`; the bounty it posts is marked `is_test`. It never touches the owner's wallet
// or certification. The kill switch is left as it was found.
import { writeFileSync } from 'node:fs';
import { base58Bytes } from '../../supabase/functions/_shared/solana-tx.ts';
import { CHEST_BLOCK_WINDOW, chestSeed, commitLandedInTime, instructionCommits, parseCommit, recomputeChest } from '../../supabase/functions/_shared/tera-roll.ts';
import { balance, call, check, completeDays, done, explorer, get, loadAuthority, loadTreasury, login, rpc, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const PART = process.env.PART ?? 'all';
const OUT = process.env.TERA_E2E_OUT ?? '/tmp/hk/tera/s/proof/tera-e2e.json';
const AUTHORITY_FLOOR = 620_000_000;
const TREASURY_FLOOR = 250_000_000;
const AUTHORITY_BUDGET = 60_000_000;
const TREASURY_BUDGET = 70_000_000;
const OWNER_WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
const stamp = Date.now().toString(36);
const report = { run: stamp, started_at: new Date().toISOString(), stamps: [], chests: [] };

const tag = (learner, reason) =>
  sql(`insert into itera.test_accounts (user_id, reason) select i.user_id, 'tera-e2e: ${reason}' from itera.identities i where i.provider_subject = '${learner.authUid}' on conflict (user_id) do nothing`);
const userIdOf = async (learner) => (await sql(`select user_id from itera.identities where provider_subject = '${learner.authUid}' limit 1`))[0].user_id;
const switchValue = async () => (await sql(`select value from itera.onchain_config where key = 'tera_chest'`))[0]?.value ?? null;
const setSwitch = (value) => sql(`update itera.onchain_config set value = '${value}', updated_at = now() where key = 'tera_chest'`);
const attributesOf = async (asset) => {
  const answer = await get(`credential-verify/${asset}?fresh=1`);
  return { answer: answer.j, attributes: new Map((answer.j?.attributes ?? []).map(({ key, value }) => [key, value])) };
};
const transaction = (signature) => rpc('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);

/** Stamps one day through the passport function, timed. Answers the certification row of the answer. */
async function stampDay(learner, day) {
  await completeDays(learner.authUid, day, day);
  const started = Date.now();
  const answer = await call('passport', learner, { max_jobs: 1 });
  const ms = Date.now() - started;
  const row = [...(answer.j?.awards ?? []), ...(answer.j?.updated ?? [])].find((entry) => entry.key === 'trail_pass');
  report.stamps.push({ day, ms, http: answer.http, attempted: answer.j?.mint?.attempted ?? null });
  return { answer, row, ms };
}

/** Asks for the chest of a day until it is settled. Answers every answer it got, the last one last. */
async function settle(learner, lessonId, extraBody = {}, timeoutMs = 120_000) {
  const answers = [];
  for (const end = Date.now() + timeoutMs; Date.now() < end; ) {
    const answer = await call('tera-chest', learner, { lesson_id: lessonId, ...extraBody });
    answers.push(answer);
    const chest = answer.j?.chest;
    if (answer.http !== 200 || !chest || chest.status === 'minted' || chest.status === 'failed') break;
    await sleep(Math.min(Math.max(chest.retry_after_ms ?? 1500, 800), 6000));
  }
  return answers;
}

/** The roll of a chest redone from public data only: the RPC and the public read of the chest. */
async function recompute(chestId) {
  const published = (await get(`tera-chest/${chestId}`)).j;
  const inputs = published.recompute.inputs;
  const commit = parseCommit(inputs.commit);
  const slots = await rpc('getBlocks', [commit.slot, commit.slot + CHEST_BLOCK_WINDOW, { commitment: 'confirmed' }]);
  const block = await rpc('getBlock', [slots[0], { commitment: 'confirmed', transactionDetails: 'none', rewards: false, maxSupportedTransactionVersion: 0 }]);
  const result = recomputeChest({ blockhash: block.blockhash, certification: inputs.certification, day: inputs.day, commit: inputs.commit, poolDocument: published.recompute.pool_document, unavailable: published.recompute.unavailable });
  return { published, slot: slots[0], blockhash: block.blockhash, commit, result };
}

async function chestPart() {
  const lessons = (await sql(`select l.id, l.ordinal + 1 as day from itera.lessons l join itera.units u on u.id = l.unit_id join itera.programs p on p.id = u.program_id where p.slug = 'itera-v2' and u.ordinal = 0 order by l.ordinal`)).map((row) => row.id);
  const learner = await login(wallet(`tera-e2e-a-${stamp}`));
  const stranger = await login(wallet(`tera-e2e-b-${stamp}`));
  await tag(learner, 'chest learner');
  await tag(stranger, 'stranger');
  const userId = await userIdOf(learner);
  report.learner = learner.address;
  console.log(`learner ${learner.address}`);

  // ---- Day 1: stamp, commitment, settle, recompute -------------------------------------------
  const first = await stampDay(learner, 1);
  check('day 1 is stamped by the passport function', first.answer.http === 200 && first.row?.mint_status === 'minted' && first.row?.state?.days_done === 1, `${first.ms} ms`);
  const certification = first.row.asset_address;
  const stampTx = first.row.tx_signature;
  report.certification = certification;

  // Before the committed slot exists: the chest is there, committed, and gives nothing yet.
  const early = await call('tera-chest', learner, { lesson_id: lessons[0] });
  const earlyChest = early.j?.chest;
  const tipAtEarly = await rpc('getSlot', [{ commitment: 'confirmed' }]);
  if (earlyChest?.status === 'committed') {
    check('a settle before the committed slot exists answers `committed`, a pause, and no Tera', early.http === 200 && earlyChest.tera === null && earlyChest.seed === null && earlyChest.retry_after_ms > 0, `retry_after_ms ${earlyChest.retry_after_ms}`);
  } else {
    check('a settle before the committed slot exists answers `committed` (not exercised: the slot had passed)', earlyChest?.status === 'minted' || earlyChest?.status === 'rolling', `status ${earlyChest?.status}, tip ${tipAtEarly}`);
  }

  const onchain = await attributesOf(certification);
  const commitText = onchain.attributes.get('chest:1');
  const commit = parseCommit(commitText);
  check('the certification asset carries `chest:1` = <slot>.<level>.<pool hash>', commit !== null, commitText);
  const stampTransaction = await transaction(stampTx);
  const carried = stampTransaction.transaction.message.instructions.some((instruction) => instructionCommits(base58Bytes(instruction.data) ?? new Uint8Array(), 1, commitText));
  check('the STAMP transaction itself wrote that commitment (same transaction as the stamp)', carried && stampTransaction.transaction.message.accountKeys.includes(certification), explorer('tx', stampTx));
  check('the commitment landed in a slot before the slot it names', commitLandedInTime(stampTransaction.slot, commit), `landed ${stampTransaction.slot}, committed ${commit.slot}, margin ${commit.slot - stampTransaction.slot} slots`);
  report.chests.push({ day: 1, commit: commitText, landed: stampTransaction.slot, margin_slots: commit.slot - stampTransaction.slot });

  // A client that sends a tier, a key and a level: nothing of it is read.
  const settleStarted = Date.now();
  const answers = await settle(learner, lessons[0], { tier: 'primordial', key: 'brand_phoenix_full', level: 3, item_key: 'brand_phoenix_full', serial: 1, wallet: OWNER_WALLET });
  const chest = answers[answers.length - 1].j?.chest;
  report.chests[0].settle_ms = Date.now() - settleStarted;
  report.chests[0].stamp_to_tera_ms = Date.now() - settleStarted + first.ms;
  check('the chest of day 1 settles into a minted Tera', chest?.status === 'minted' && Boolean(chest?.tera?.asset), `${chest?.tera?.key} (${chest?.tier}) in ${report.chests[0].settle_ms} ms after the stamp answered`);

  const redo = await recompute(chest.id);
  check('a stranger reads the seed block from the RPC: it is the block the chest used', redo.slot === chest.seed.slot && redo.blockhash === chest.seed.blockhash, `slot ${redo.slot}`);
  check('the seed is sha256 of the blockhash, the certification and the day', redo.result.ok && redo.result.seed === chest.seed.value && redo.result.seed === chestSeed(redo.blockhash, certification, 1));
  check('recomputing the roll from public data gives the same Tera', redo.result.ok && redo.result.key === chest.tera.key && redo.result.tier === chest.tier, `${redo.result.key}`);
  check('a tier and a key sent by the client decided nothing', chest.tera.key === redo.result.key && chest.level === commit.level && chest.tera.key !== 'brand_phoenix_full');
  const poolDoc = JSON.parse(redo.published.recompute.pool_document);
  check('the committed pool names the tiers that are never sold: the walk cannot climb into one', poolDoc.v === 2 && JSON.stringify(poolDoc.earn_only) === JSON.stringify(['legendary', 'mythic', 'primordial']) && JSON.stringify(redo.published.recompute.earn_only) === JSON.stringify(poolDoc.earn_only));
  check('the public read needs no session and names the chain inputs', redo.published.recompute.inputs.commit === commitText && redo.published.recompute.inputs.commit_tx === stampTx && redo.published.chest.id === chest.id);
  report.chests[0] = { ...report.chests[0], id: chest.id, tera: chest.tera.key, tier: chest.tier, asset: chest.tera.asset, seed_slot: redo.slot };

  // The minted Tera: frozen, in our collection, with its origin on chain.
  const tera = await attributesOf(chest.tera.asset);
  check('the earned Tera is ours, owned by the learner and FROZEN (soulbound)', tera.answer.verified === true && tera.answer.frozen === true && tera.answer.owner === learner.address, explorer('address', chest.tera.asset));
  check(
    'it carries its origin on chain: earned, the wallet, the certification, the day, the commitment and the seed block',
    tera.attributes.get('origin') === 'earned' && tera.attributes.get('learner') === learner.address && tera.attributes.get('certification') === certification && tera.attributes.get('day') === '1' &&
      tera.attributes.get('chest') === commitText && tera.attributes.get('seed_slot') === String(redo.slot) && tera.attributes.get('seed_blockhash') === redo.blockhash && tera.attributes.get('key') === chest.tera.key,
  );
  check('credential-verify says how it was obtained and that it cannot be transferred', tera.answer.avatar?.origin === 'earned' && tera.answer.avatar?.transferable === false && tera.answer.avatar?.earned?.chest_id === chest.id && tera.answer.avatar?.proof?.asset === chest.tera.asset);
  const byAsset = await get(`tera-chest/${chest.tera.asset}`);
  check('the chest is also found by the address of the Tera it minted', byAsset.http === 200 && byAsset.j?.chest?.id === chest.id);
  const profile = (await get(`learner-profile/${learner.address}?fresh=1`)).j;
  const listed = (profile?.avatars ?? []).find((entry) => entry.asset === chest.tera.asset);
  check('learner-profile lists it as earned, not transferable, with the day that opened it', listed?.origin === 'earned' && listed?.transferable === false && listed?.earned?.day === 1 && listed?.earned?.certification === certification && listed?.verified === true && Boolean(listed?.rarity));
  const shelf = (await call('shop-items?lang=en', learner, null, 'GET')).j;
  const shelfEntry = (shelf ?? []).find((entry) => entry.key === chest.tera.key);
  check('shop-items shows the caller owns it by earning it', shelfEntry?.owned === true && shelfEntry?.origin === 'earned' && shelfEntry?.transferable === false && shelfEntry?.proof?.asset === chest.tera.asset);
  const mine = (await call('tera-chest', learner, null, 'GET')).j;
  check('the learner\'s list has the chest and says the chest is on', mine?.enabled === true && mine?.chests?.[0]?.id === chest.id && mine?.chests?.[0]?.tera?.key === chest.tera.key);

  // ---- Replay ---------------------------------------------------------------------------------
  const replay = await call('tera-chest', learner, { lesson_id: lessons[0] });
  const unitsAfterReplay = await sql(`select count(*)::int n from itera.avatar_assets where chest_id = '${chest.id}'`);
  check('a replayed settle answers the same chest and mints nothing', replay.j?.chest?.tera?.asset === chest.tera.asset && unitsAfterReplay[0].n === 1);

  // ---- Somebody else's day, a day never stamped -------------------------------------------------
  const foreign = await call('tera-chest', stranger, { lesson_id: lessons[0] });
  check('another learner asking for this day gets no chest (theirs is not stamped)', foreign.http === 200 && foreign.j?.chest === null);
  const strangerList = (await call('tera-chest', stranger, null, 'GET')).j;
  check('and sees none of this learner\'s chests in their list', Array.isArray(strangerList?.chests) && strangerList.chests.length === 0);
  const unstamped = await call('tera-chest', learner, { lesson_id: lessons[4] });
  check('a day that was never stamped opens no chest', unstamped.http === 200 && unstamped.j?.chest === null);
  const unknown = await call('tera-chest', learner, { lesson_id: '00000000-0000-4000-8000-000000000000' });
  check('an unknown lesson opens no chest', unknown.http === 200 && unknown.j?.chest === null);
  const nobody = await call('tera-chest', null, { lesson_id: lessons[0] });
  check('a settle without a session is refused', nobody.http === 401);
  const junk = await call('tera-chest', learner, { lesson_id: 'x' });
  check('a malformed body is refused', junk.http === 400);

  // ---- Day 2: the learner holds every common Tera, and three settles race -------------------------
  const commons = (await get('credential-meta/tiers')).j;
  const commonKeys = Object.entries(commons.avatars).filter(([, rarity]) => rarity === 'common').map(([key]) => key);
  const fill = commonKeys.filter((key) => key !== chest.tera.key);
  await sql(`insert into itera.avatar_assets (user_id, item_key, serial, mint_status, origin) select '${userId}', key, 900001, 'pending', 'bought' from unnest(array[${fill.map((key) => `'${key}'`).join(',')}]) as key on conflict (user_id, item_key) do nothing`);
  const second = await stampDay(learner, 2);
  check('day 2 is stamped', second.row?.state?.days_done === 2, `${second.ms} ms`);
  const secondCommit = (await attributesOf(certification)).attributes;
  check('the certification now carries both commitments, and day 1 kept its own', secondCommit.get('chest:1') === commitText && parseCommit(secondCommit.get('chest:2')) !== null, secondCommit.get('chest:2'));
  const target = parseCommit(secondCommit.get('chest:2')).slot;
  while ((await rpc('getSlot', [{ commitment: 'confirmed' }])) <= target + 1) await sleep(500);
  const race = await Promise.all([0, 1, 2, 3].map(() => call('tera-chest', learner, { lesson_id: lessons[1] })));
  const raced = await settle(learner, lessons[1]);
  const secondChest = raced[raced.length - 1].j?.chest;
  const raceUnits = await sql(`select count(*)::int n from itera.avatar_assets where chest_id = '${secondChest?.id}'`);
  check('four settles racing mint exactly one Tera', secondChest?.status === 'minted' && raceUnits[0].n === 1 && race.every((answer) => answer.http === 200), race.map((answer) => answer.j?.chest?.status).join(','));
  const redoSecond = await recompute(secondChest.id);
  check('the roll of day 2 recomputes to the same Tera', redoSecond.result.ok && redoSecond.result.key === secondChest.tera.key, `${secondChest.tera.key} (${secondChest.tier}), rolled tier ${redoSecond.result.rolled_tier}`);
  if (redoSecond.result.ok && redoSecond.result.rolled_tier === 'common') {
    check('holding every Tera of the rolled tier, the chest walks to the next tier instead of repeating or failing', secondChest.tier !== 'common' && !commonKeys.includes(secondChest.tera.key), `rolled common, gave ${secondChest.tier}`);
  } else {
    check('holding every common Tera (not exercised live: this seed rolled another tier; the walk is covered by the unit tests)', secondChest.tera.key !== chest.tera.key, `rolled ${redoSecond.result.ok ? redoSecond.result.rolled_tier : '?'}`);
  }
  check('the Teras the learner held are published as inputs of the roll', fill.every((key) => redoSecond.published.recompute.unavailable.includes(key)));
  await sql(`delete from itera.avatar_assets where user_id = '${userId}' and chest_id is null and purchase_id is null and serial >= 900000`);
  report.chests.push({ day: 2, id: secondChest.id, tera: secondChest.tera.key, tier: secondChest.tier, rolled_tier: redoSecond.result.ok ? redoSecond.result.rolled_tier : null, asset: secondChest.tera.asset });

  // ---- The kill switch --------------------------------------------------------------------------
  await setSwitch('off');
  await sleep(500);
  const third = await stampDay(learner, 3);
  check('with the switch off a day is stamped as always', third.row?.state?.days_done === 3, `${third.ms} ms`);
  const offAttributes = (await attributesOf(certification)).attributes;
  check('and its write carries no commitment for that day, while the older ones stay on the asset', !offAttributes.has('chest:3') && offAttributes.get('chest:1') === commitText && offAttributes.has('chest:2'));
  const offSettle = await call('tera-chest', learner, { lesson_id: lessons[2] });
  check('with the switch off no chest is opened', offSettle.http === 200 && offSettle.j?.enabled === false && offSettle.j?.chest === null);
  const offList = (await call('tera-chest', learner, null, 'GET')).j;
  check('and the list says so, with the Teras already earned', offList?.enabled === false && offList?.chests?.length === 2);
  const offRows = await sql(`select count(*)::int n from itera.tera_chests where user_id = '${userId}'`);
  check('no row was written for the day stamped with the switch off', offRows[0].n === 2);
  await setSwitch('on');
  await sleep(500);

  // ---- A day whose stamp carried no commitment: committed by its own write, BEFORE the slot ------
  const late = await settle(learner, lessons[2]);
  const lateChest = late[late.length - 1].j?.chest;
  check('a stamped day without a commitment gets one by its own write, then settles', lateChest?.status === 'minted' && lateChest?.commit?.via === 'own_write', `${lateChest?.tera?.key}`);
  const lateTransaction = await transaction(lateChest.commit.tx);
  check('that write also landed before the slot it names', commitLandedInTime(lateTransaction.slot, parseCommit(lateChest.commit.value)) && lateTransaction.transaction.message.instructions.some((instruction) => instructionCommits(base58Bytes(instruction.data) ?? new Uint8Array(), 3, lateChest.commit.value)), `margin ${lateChest.commit.slot - lateTransaction.slot} slots`);
  const redoLate = await recompute(lateChest.id);
  check('and its roll recomputes to the same Tera', redoLate.result.ok && redoLate.result.key === lateChest.tera.key);
  report.chests.push({ day: 3, id: lateChest.id, tera: lateChest.tera.key, tier: lateChest.tier, via: 'own_write', asset: lateChest.tera.asset });

  const keys = report.chests.map((entry) => entry.tera);
  check('three chests gave three different Teras', new Set(keys).size === 3, keys.join(', '));
  return { learner, lessons };
}

const authority = loadAuthority();
const treasury = loadTreasury();
const before = { authority: await balance(authority.address), treasury: await balance(treasury.address) };
console.log(`authority ${(before.authority / 1e9).toFixed(4)} SOL, treasury ${(before.treasury / 1e9).toFixed(4)} SOL`);
if (before.authority - AUTHORITY_BUDGET < AUTHORITY_FLOOR || before.treasury - TREASURY_BUDGET < TREASURY_FLOOR) throw new Error('balances too low for this run: nothing was sent');
const switchBefore = await switchValue();
if (switchBefore === null) throw new Error('onchain_config.tera_chest is missing: apply migration 0351 first');

try {
  if (switchBefore !== 'on') await setSwitch('on');
  if (PART === 'all' || PART === 'chest') await chestPart();
  if (PART === 'all' || PART === 'sponsor') {
    const { sponsorPart } = await import('./tera-e2e.sponsor.mjs');
    await sponsorPart({ stamp, report, treasury });
  }
} finally {
  if (process.env.KEEP_SWITCH !== '1') await setSwitch(switchBefore);
  const after = { authority: await balance(authority.address), treasury: await balance(treasury.address) };
  report.spent = { authority_sol: (before.authority - after.authority) / 1e9, treasury_sol: (before.treasury - after.treasury) / 1e9 };
  report.finished_at = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`spent: authority ${report.spent.authority_sol.toFixed(5)} SOL, treasury ${report.spent.treasury_sol.toFixed(5)} SOL; report ${OUT}`);
}
done();
