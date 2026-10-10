#!/usr/bin/env node
// End-to-end check of Phoenix Crystals on the hackathon project and Solana devnet: earn (the
// ledger function the hooks call, and the real lesson-end hook), spend on a life and on a refill,
// spend on a background, equip, refusals, two races, and the Token-2022 balance following the ledger.
//
//   node scripts/hackathon/crystals-e2e.mjs [--no-chain]
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD,
// SUPABASE_ACCESS_TOKEN (or HACKATHON_ANON_KEY).
//
// Two throwaway wallet learners, left behind. Costs the authority two token accounts and a few
// fees (about 0.005 SOL; the first run also creates the mint). Never touches the owner's wallet
// account or the demo e-mail user.
import { FUNCTIONS, PROTECTED_WALLET, anonKey, balance, check, loadAuthority, newLearner, psql, rpc, sol, summary, until } from './social-e2e.lib.mjs';

const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RUN = `e2e-${Date.now().toString(36)}`;
const withChain = !process.argv.includes('--no-chain');

/** Seeds crystals through the same ledger function the earn hooks call. Returns `balance|is_new`. */
const grant = (learner, amount, ref) =>
  psql(`select balance || '|' || is_new from itera.crystal_grant(:'user_id'::uuid, :amount, 'e2e_seed', :'ref');`, { user_id: learner.userId, amount, ref });
const setLives = (learner, lives) =>
  psql(
    `insert into itera.companions (user_id, lives) values (:'user_id'::uuid, :lives)
     on conflict (user_id) do update set lives = :lives, last_regen_at = now(), version = itera.companions.version + 1;`,
    { user_id: learner.userId, lives },
  );
const livesOf = (learner) => Number(psql(`select lives from itera.companions where user_id = :'user_id'::uuid;`, { user_id: learner.userId }));
const ledgerCount = (learner, reason, refLike) =>
  Number(psql(`select count(*) from itera.crystal_ledger where user_id = :'user_id'::uuid and reason = :'reason' and ref_id like :'ref';`, { user_id: learner.userId, reason, ref: refLike }));
const ledgerSum = (learner) => Number(psql(`select coalesce(sum(delta), 0) from itera.crystal_ledger where user_id = :'user_id'::uuid;`, { user_id: learner.userId }));
const spend = (learner, body) => learner.call('crystals/spend', body);
const statuses = (answers) => answers.map((answer) => answer.status).sort().join(',');

async function tokenAmount(account) {
  const info = (await rpc('getAccountInfo', [account, { encoding: 'jsonParsed', commitment: 'confirmed' }])).value;
  return info ? Number(info.data.parsed.info.tokenAmount.amount) : null;
}

async function main() {
  const apikey = await anonKey();
  const authority = loadAuthority();
  const before = await balance(authority.address);
  console.log(`before: authority ${authority.address} ${sol(before)} SOL`);

  const ana = await newLearner(apikey, 'ana');
  const bia = await newLearner(apikey, 'bia');

  console.log('\n== names ==');
  const name = psql(`select display_name from itera.users where id = :'user_id'::uuid;`, { user_id: ana.userId });
  check('a new wallet learner is named "Tera <Adjetivo> <3 digits>", not by the address', /^Tera [A-Z][a-z]+ \d{3}$/.test(name), name);

  console.log('\n== read ==');
  const anonymous = await fetch(`${FUNCTIONS}/crystals`, { headers: { apikey } });
  check('GET /crystals without a session is 401', anonymous.status === 401, anonymous.status);
  const fresh = await ana.get('crystals');
  check('a new learner has 0 crystals and an empty ledger', fresh.status === 200 && fresh.body.balance === 0 && fresh.body.ledger.length === 0, JSON.stringify(fresh.body).slice(0, 120));
  check('prices carry the single life (5) and the backgrounds (75)', fresh.body.prices?.life === 5 && fresh.body.prices?.bg_midnight === 75 && fresh.body.prices?.life_refill === 20);
  check('prices leave out what is not sold for crystals', !('life_gift' in fresh.body.prices) && !('bg_obsidian' in fresh.body.prices));
  check('ten earn rules, labelled', fresh.body.earn_rules?.length === 10 && fresh.body.earn_rules.every((rule) => rule.label && rule.crystals > 0));
  check('theme is always there: the defaults', fresh.body.theme?.background?.key === 'bg_obsidian' && fresh.body.theme.background.color === '#0A0908' && fresh.body.theme?.icon?.key === 'icon_green');
  check('twelve theme items, the two defaults owned and equipped', fresh.body.theme_items?.length === 12 && fresh.body.theme_items.filter((item) => item.owned && item.equipped && item.default).length === 2);

  console.log('\n== earn ==');
  check('a grant credits once', grant(ana, 120, `${RUN}-a`) === '120|true');
  check('the same grant again credits nothing', grant(ana, 120, `${RUN}-a`) === '120|false');
  const lesson = psql(`select l.id || '|' || min(a.id::text) from itera.lessons l join itera.activities a on a.lesson_id = l.id and a.status = 'published' group by l.id having count(*) = 1 order by l.id limit 1;`).split('|');
  psql(`insert into itera.progress (user_id, activity_id, status, completed_at) values (:'user_id'::uuid, :'activity'::uuid, 'completed', now()) on conflict do nothing;`, { user_id: ana.userId, activity: lesson[1] });
  const ended = await ana.call('lives', { action: 'lesson_end', lesson_id: lesson[0], mistakes: 0 });
  check('lesson end answers as before', ended.status === 200 && ended.body.lives, JSON.stringify(ended.body).slice(0, 120));
  await ana.call('lives', { action: 'lesson_end', lesson_id: lesson[0], mistakes: 0 });
  const earned = await ana.get('crystals');
  check('the lesson-end hook paid a clean lesson 3 crystals, once', earned.body.balance === 123 && ledgerCount(ana, 'lesson_clean', lesson[0]) === 1, earned.body.balance);
  check('the ledger lists the movements, newest first', earned.body.ledger.length === 2 && earned.body.ledger.some((entry) => entry.reason === 'lesson_clean' && entry.delta === 3));
  const unfinished = psql(`select l.id from itera.lessons l join itera.activities a on a.lesson_id = l.id and a.status = 'published' group by l.id having count(*) > 3 order by l.id limit 1;`);
  await ana.call('lives', { action: 'lesson_end', lesson_id: unfinished, mistakes: 0 });
  check('a lesson that is not complete pays nothing', ledgerCount(ana, 'lesson_clean', '%') === 1);

  console.log('\n== spend: lives ==');
  const full = await spend(ana, { item_key: 'life' });
  check('a full learner is refused a life (409 not_needed), nothing debited', full.status === 409 && full.body.error === 'not_needed' && ledgerSum(ana) === 123, JSON.stringify(full.body));
  setLives(ana, 3);
  const one = await spend(ana, { item_key: 'life' });
  check('one life costs 5 and adds one life', one.status === 200 && one.body.balance === 118 && one.body.lives?.current === 4 && one.body.item?.qty === 1, JSON.stringify(one.body).slice(0, 160));
  const many = await spend(ana, { item_key: 'life', qty: 5 });
  check('asking for 5 with room for 1 sells 1 and charges 5', many.status === 200 && many.body.balance === 113 && many.body.lives?.current === 5 && many.body.item?.qty === 1, JSON.stringify(many.body).slice(0, 160));
  check('a malformed qty is 400', (await spend(ana, { item_key: 'life', qty: 9 })).status === 400);
  setLives(ana, 1);
  const refill = await spend(ana, { item_key: 'life_refill' });
  check('the refill costs 20 and fills to 5', refill.status === 200 && refill.body.balance === 93 && refill.body.lives?.current === 5, JSON.stringify(refill.body).slice(0, 160));

  console.log('\n== spend: background, equip ==');
  const bought = await spend(ana, { item_key: 'bg_midnight' });
  check('a background costs 75', bought.status === 200 && bought.body.balance === 18 && bought.body.item?.kind === 'background', JSON.stringify(bought.body).slice(0, 200));
  check('buying does not equip', bought.body.theme?.background?.key === 'bg_obsidian');
  const again = await spend(ana, { item_key: 'bg_midnight' });
  check('buying it again is 409 already_owned, nothing debited', again.status === 409 && again.body.error === 'already_owned' && ledgerSum(ana) === 18, JSON.stringify(again.body));
  const worn = await ana.call('crystals/equip', { background: 'bg_midnight' });
  check('equip wears the owned background', worn.status === 200 && worn.body.theme?.background?.key === 'bg_midnight' && worn.body.theme.background.color === '#0B1020' && worn.body.theme.icon.key === 'icon_green', JSON.stringify(worn.body));
  const notOwned = await ana.call('crystals/equip', { icon: 'icon_gold' });
  check('equip of something not owned is 409 not_owned', notOwned.status === 409 && notOwned.body.error === 'not_owned', JSON.stringify(notOwned.body));
  check('equip of a key of the wrong kind is 404', (await ana.call('crystals/equip', { background: 'icon_gold' })).status === 404);
  check('equip with no slot is 400', (await ana.call('crystals/equip', {})).status === 400);
  const read = await ana.get('crystals');
  check('GET /crystals carries the chosen theme and marks it equipped', read.body.theme.background.key === 'bg_midnight' && read.body.theme_items.find((item) => item.key === 'bg_midnight')?.equipped === true);
  const back = await ana.call('crystals/equip', { equip: { background: 'bg_obsidian' } });
  check('the default can always be worn again', back.status === 200 && back.body.theme.background.key === 'bg_obsidian');

  console.log('\n== spend: outfit, refusals ==');
  grant(ana, 100, `${RUN}-b`);
  const outfit = await spend(ana, { item_key: 'outfit_glasses' });
  check('an outfit costs 100 and lands in the inventory', outfit.status === 200 && outfit.body.balance === 18 && outfit.body.inventory?.some((entry) => entry.item_key === 'outfit_glasses') && outfit.body.companion, JSON.stringify(outfit.body).slice(0, 200));
  const gift = await spend(ana, { item_key: 'life_gift' });
  check('a gift is 400 not_for_crystals', gift.status === 400 && gift.body.error === 'not_for_crystals', JSON.stringify(gift.body));
  check('a free default is 400 not_for_crystals', (await spend(ana, { item_key: 'bg_obsidian' })).body.error === 'not_for_crystals');
  check('an unknown item is 404', (await spend(ana, { item_key: 'nope' })).status === 404);
  const noPassport = await spend(ana, { item_key: 'ink_violet', ref_id: crypto.randomUUID() });
  check('an ink without a minted certification is 409 passport_required', noPassport.status === 409 && noPassport.body.error === 'passport_required', JSON.stringify(noPassport.body));
  const short = await spend(ana, { item_key: 'bg_grape' });
  check('18 crystals do not buy a 75 background: 402 with balance and price', short.status === 402 && short.body.error === 'insufficient_crystals' && short.body.balance === 18 && short.body.price === 75, JSON.stringify(short.body));
  check('nothing was debited by the refusals', ledgerSum(ana) === 18);

  console.log('\n== races ==');
  const broke = await spend(bia, { item_key: 'bg_grape' });
  check('a learner with nothing is refused (402, balance 0)', broke.status === 402 && broke.body.balance === 0, JSON.stringify(broke.body));
  grant(bia, 75, `${RUN}-c`);
  const twins = await Promise.all([spend(bia, { item_key: 'bg_grape' }), spend(bia, { item_key: 'bg_grape' })]);
  check('the same background bought twice at once: no request fails', twins.every((answer) => answer.status === 200 || (answer.status === 409 && answer.body.error === 'already_owned')) && twins.some((answer) => answer.status === 200), statuses(twins));
  check('…one debit, balance 0, one item', ledgerCount(bia, 'spend', 'bg_grape:%') === 1 && ledgerSum(bia) === 0 && psql(`select count(*) from itera.user_inventory where user_id = :'user_id'::uuid and item_key = 'bg_grape';`, { user_id: bia.userId }) === '1');
  check('…one purchase row, applied', psql(`select count(*) || '|' || count(applied_at) from itera.purchases where user_id = :'user_id'::uuid and source = 'crystals';`, { user_id: bia.userId }) === '1|1');

  grant(bia, 5, `${RUN}-d`);
  setLives(bia, 3);
  const lastFive = await Promise.all([spend(bia, { item_key: 'life' }), spend(bia, { item_key: 'life' })]);
  check('two lives at once with crystals for one: one sold, one refused 402', statuses(lastFive) === '200,402', statuses(lastFive));
  check('…one life added, balance 0, never negative', livesOf(bia) === 4 && ledgerSum(bia) === 0 && (await bia.get('crystals')).body.balance === 0, livesOf(bia));

  grant(bia, 10, `${RUN}-e`);
  const lastSlot = await Promise.all([spend(bia, { item_key: 'life' }), spend(bia, { item_key: 'life' })]);
  check('two lives at once with room for one: one sold, one refused 409 not_needed', statuses(lastSlot) === '200,409', statuses(lastSlot));
  check('…no crystal lost: 5 lives, 5 crystals left', livesOf(bia) === 5 && ledgerSum(bia) === 5 && (await bia.get('crystals')).body.balance === 5, `${livesOf(bia)} lives, ${ledgerSum(bia)} crystals`);
  check('every balance equals the sum of its ledger', psql(`select count(*) from itera.crystal_accounts a where a.balance <> (select coalesce(sum(delta), 0) from itera.crystal_ledger l where l.user_id = a.user_id);`) === '0');

  if (withChain) {
    console.log('\n== token mirror ==');
    for (const learner of [ana, bia]) {
      const view = await until(() => learner.get('crystals'), (answer) => answer.body.mirrored === true && answer.body.token_account, 40, 3000);
      const held = view.body.token_account ? await tokenAmount(view.body.token_account) : null;
      check(`${learner.label}: the token balance equals the ledger balance`, view.body.mirrored === true && held === view.body.balance, `ledger ${view.body.balance}, chain ${held}, ${view.body.explorer_url}`);
    }
    const view = (await ana.get('crystals')).body;
    const mint = (await rpc('getAccountInfo', [view.mint, { encoding: 'jsonParsed', commitment: 'confirmed' }])).value;
    const extensions = (mint?.data?.parsed?.info?.extensions ?? []).map((entry) => entry.extension);
    check('the mint is Token-2022, no decimals, minted by the authority', mint?.owner === TOKEN_2022 && mint.data.parsed.info.decimals === 0 && mint.data.parsed.info.mintAuthority === authority.address, view.mint);
    check('the mint is non-transferable, with the authority as permanent delegate and its own metadata', ['nonTransferable', 'permanentDelegate', 'metadataPointer', 'tokenMetadata'].every((name) => extensions.includes(name)), extensions.join(','));
    const metadata = mint?.data?.parsed?.info?.extensions?.find((entry) => entry.extension === 'tokenMetadata')?.state;
    check('the token is called "Cristal de Fênix" (FENIX)', metadata?.name === 'Cristal de Fênix' && metadata?.symbol === 'FENIX', JSON.stringify(metadata ?? null).slice(0, 160));
    const account = (await rpc('getAccountInfo', [view.token_account, { encoding: 'jsonParsed', commitment: 'confirmed' }])).value;
    check("the token account is the learner's own", account?.data?.parsed?.info?.owner === ana.address && account.data.parsed.info.mint === view.mint);

    setLives(ana, 4);
    const burnt = await spend(ana, { item_key: 'life' });
    check('a spend after the mirror answers at once', burnt.status === 200 && burnt.body.balance === 13, JSON.stringify(burnt.body).slice(0, 100));
    const after = await until(() => ana.get('crystals'), (answer) => answer.body.mirrored === true && answer.body.balance === 13, 40, 3000);
    check('…and the 5 crystals are burnt by the permanent delegate, the learner signing nothing', (await tokenAmount(after.body.token_account)) === 13, `chain ${await tokenAmount(after.body.token_account)}`);
  }

  console.log('\n== protected accounts ==');
  const touched = psql(
    `select count(*) from itera.crystal_ledger l where l.user_id in (
       select id from itera.users where email = :'demo'
       union select user_id from itera.companions where wallet_address = :'owner'
       union select user_id from itera.user_wallets where wallet = :'owner');`,
    { demo: process.env.HACKATHON_DEMO_EMAIL ?? '', owner: PROTECTED_WALLET },
  );
  check('the owner and the demo account have no crystal movement', touched === '0', touched);

  const after = await balance(authority.address);
  console.log(`\nauthority: ${sol(before)} -> ${sol(after)} SOL (${sol(after - before)})`);
  const { total, failed } = summary();
  console.log(`\n${total - failed.length}/${total} checks passed`);
  if (failed.length > 0) {
    console.log(failed.map((entry) => `  FAILED: ${entry}`).join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
