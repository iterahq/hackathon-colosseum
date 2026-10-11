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
/** Ledger rows of the accounts no script may touch. The owner plays, so the count is compared, not expected to be zero. */
const protectedLedgerRows = () =>
  psql(
    `select count(*) from itera.crystal_ledger l where l.user_id in (
       select id from itera.users where email = :'demo'
       union select user_id from itera.companions where wallet_address = :'owner'
       union select user_id from itera.user_wallets where wallet = :'owner');`,
    { demo: process.env.HACKATHON_DEMO_EMAIL ?? '', owner: PROTECTED_WALLET },
  );
const statuses = (answers) => answers.map((answer) => answer.status).sort().join(',');

async function tokenAmount(account) {
  const info = (await rpc('getAccountInfo', [account, { encoding: 'jsonParsed', commitment: 'confirmed' }])).value;
  return info ? Number(info.data.parsed.info.tokenAmount.amount) : null;
}

async function main() {
  const apikey = await anonKey();
  const protectedBefore = protectedLedgerRows();
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
  check('prices carry the single life (5), the backgrounds (75) and the refill (30)', fresh.body.prices?.life === 5 && fresh.body.prices?.bg_midnight === 75 && fresh.body.prices?.life_refill === 30);
  check('prices leave out what is not sold for crystals', !('life_gift' in fresh.body.prices) && !('bg_obsidian' in fresh.body.prices));
  check('ten earn rules, labelled', fresh.body.earn_rules?.length === 10 && fresh.body.earn_rules.every((rule) => rule.label && rule.crystals > 0));
  check('theme is always there: the defaults', fresh.body.theme?.background?.key === 'bg_obsidian' && fresh.body.theme.background.color === '#0A0908' && fresh.body.theme?.icon?.key === 'icon_green');
  check('theme items: 6 backgrounds, 6 icon colours, 25 borders; the three defaults owned and equipped', fresh.body.theme_items?.length === 37 && fresh.body.theme_items.filter((item) => item.owned && item.equipped && item.default).length === 3 && fresh.body.theme.border?.key === 'border_none' && fresh.body.accept === 'both');

  console.log('\n== earn ==');
  check('a grant credits once', grant(ana, 120, `${RUN}-a`) === '120|true');
  check('the same grant again credits nothing', grant(ana, 120, `${RUN}-a`) === '120|false');
  const lesson = psql(`select l.id || '|' || min(a.id::text) from itera.lessons l join itera.activities a on a.lesson_id = l.id and a.status = 'published' group by l.id having count(*) = 1 order by l.id limit 1;`).split('|');
  // H1: progress written through PostgREST by the learner (what anybody can do) plus a lesson_end that claims no mistakes.
  const forgedWrite = await fetch(`${FUNCTIONS.replace('/functions/v1', '')}/rest/v1/progress`, {
    method: 'POST',
    headers: { ...ana.headers, 'Content-Profile': 'itera', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: ana.userId, activity_id: lesson[1], status: 'completed', completed_at: new Date().toISOString() }),
  });
  const forgedFlag = psql(`select written_by_client from itera.progress where user_id = :'user_id'::uuid and activity_id = :'activity'::uuid;`, { user_id: ana.userId, activity: lesson[1] });
  const ended = await ana.call('lives', { action: 'lesson_end', lesson_id: lesson[0], mistakes: 0 });
  check('lesson end answers as before', ended.status === 200 && ended.body.lives, JSON.stringify(ended.body).slice(0, 120));
  await ana.call('lives', { action: 'lesson_end', lesson_id: lesson[0], mistakes: 0 });
  const forgedPassport = await ana.call('passport', {});
  const earned = await ana.get('crystals');
  check('a FORGED lesson (client-written progress, mistakes: 0) earns nothing through lives or passport', earned.body.balance === 120 && ledgerCount(ana, 'lesson_clean', '%') === 0 && ledgerCount(ana, 'lesson_completed', '%') === 0, `write ${forgedWrite.status}, written_by_client ${forgedFlag}, passport ${forgedPassport.status}, balance ${earned.body.balance}`);
  grant(ana, 3, `${RUN}-a2`);
  check('the ledger lists the movements, newest first', (await ana.get('crystals')).body.ledger.length === 2);

  console.log('\n== earn: an honest day through passport (H2) ==');
  const dee = await newLearner(apikey, 'dee');
  // The first lesson of the program (a stamped day needs a lesson inside a trail); progress as operator seeding, like passport-e2e.
  const dayLesson = psql(`select l.id from itera.lessons l join itera.units u on u.id = l.unit_id join itera.programs p on p.id = u.program_id where p.slug = 'itera-v2' order by u.ordinal, l.ordinal, l.id limit 1;`);
  const dayActivity = psql(`select min(id::text) from itera.activities where lesson_id = :'lesson'::uuid and status = 'published';`, { lesson: dayLesson });
  psql(`insert into itera.progress (user_id, activity_id, status, completed_at) select :'user_id'::uuid, a.id, 'completed', now() from itera.activities a where a.lesson_id = :'lesson'::uuid and a.status = 'published' on conflict do nothing;`, { user_id: dee.userId, lesson: dayLesson });
  const day = await dee.call('passport', {});
  const paidDay = await dee.get('crystals');
  const reasons = (learner) => psql(`select coalesce(string_agg(reason || ':' || delta, ',' order by reason), '') from itera.crystal_ledger where user_id = :'user_id'::uuid;`, { user_id: learner.userId });
  check('one honest day pays the day (10), the lesson (2) and the clean lesson (3), once', day.status === 200 && paidDay.body.balance === 15 && reasons(dee) === 'day_completed:10,lesson_clean:3,lesson_completed:2', `${day.status} ${reasons(dee)}`);
  await dee.call('passport', {});
  await dee.call('passport', {});
  check('a second and a third passport call pay nothing more', (await dee.get('crystals')).body.balance === 15 && reasons(dee) === 'day_completed:10,lesson_clean:3,lesson_completed:2');
  psql(`delete from itera.crystal_ledger where user_id = :'user_id'::uuid and reason = 'day_completed';
        update itera.crystal_accounts set balance = balance - 10 where user_id = :'user_id'::uuid;`, { user_id: dee.userId });
  await dee.call('passport', {});
  check('an award whose payment is missing is paid by the next call (reconcile), not twice', (await dee.get('crystals')).body.balance === 15 && ledgerCount(dee, 'day_completed', '%') === 1);
  psql(`insert into itera.life_events (user_id, attempt_id, activity_id, kind) values (:'user_id'::uuid, 'e2e-lose', :'activity'::uuid, 'lose');`, { user_id: dee.userId, activity: dayActivity });
  check('a lost life recorded by the server on that lesson is what makes a lesson not clean (nothing is re-paid)', (await dee.call('passport', {})).status === 200 && (await dee.get('crystals')).body.balance === 15);
  const unfinished = psql(`select l.id from itera.lessons l join itera.activities a on a.lesson_id = l.id and a.status = 'published' group by l.id having count(*) > 3 order by l.id limit 1;`);
  await ana.call('lives', { action: 'lesson_end', lesson_id: unfinished, mistakes: 0 });
  check('a lesson that is not complete pays nothing', ledgerCount(ana, 'lesson_clean', '%') === 0);
  if (process.argv.includes('--only-earn')) {
    const { total, failed } = summary();
    console.log(`\n${total - failed.length}/${total} checks passed (earn section only)`);
    console.log(failed.map((entry) => `  FAILED: ${entry}`).join('\n'));
    process.exit(failed.length > 0 ? 1 : 0);
  }

  console.log('\n== spend: lives ==');
  const full = await spend(ana, { item_key: 'life' });
  check('a full learner is refused a life (409 not_needed), nothing debited', full.status === 409 && full.body.error === 'not_needed' && ledgerSum(ana) === 123, JSON.stringify(full.body));
  setLives(ana, 3);
  const one = await spend(ana, { item_key: 'life' });
  check('one life costs 5 and adds one life', one.status === 200 && one.body.balance === 118 && one.body.lives?.current === 4 && one.body.item?.qty === 1, JSON.stringify(one.body).slice(0, 160));
  setLives(ana, 9);
  const many = await spend(ana, { item_key: 'life', qty: 5 });
  check('asking for 5 with room for 1 sells 1 and charges 5', many.status === 200 && many.body.balance === 113 && many.body.lives?.current === 10 && many.body.item?.qty === 1, JSON.stringify(many.body).slice(0, 160));
  check('a malformed qty is 400', (await spend(ana, { item_key: 'life', qty: 9 })).status === 400);
  setLives(ana, 1);
  const refill = await spend(ana, { item_key: 'life_refill' });
  check('the refill costs 30 and fills to 10', refill.status === 200 && refill.body.balance === 83 && refill.body.lives?.current === 10, JSON.stringify(refill.body).slice(0, 160));

  console.log('\n== spend: background, equip ==');
  const bought = await spend(ana, { item_key: 'bg_midnight' });
  check('a background costs 75', bought.status === 200 && bought.body.balance === 8 && bought.body.item?.kind === 'background', JSON.stringify(bought.body).slice(0, 200));
  check('buying does not equip', bought.body.theme?.background?.key === 'bg_obsidian');
  const again = await spend(ana, { item_key: 'bg_midnight' });
  check('buying it again is 409 already_owned, nothing debited', again.status === 409 && again.body.error === 'already_owned' && ledgerSum(ana) === 8, JSON.stringify(again.body));
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
  check('an outfit costs 100 and lands in the inventory', outfit.status === 200 && outfit.body.balance === 8 && outfit.body.inventory?.some((entry) => entry.item_key === 'outfit_glasses') && outfit.body.companion, JSON.stringify(outfit.body).slice(0, 200));
  const gift = await spend(ana, { item_key: 'life_gift' });
  check('a gift is 400 not_for_crystals', gift.status === 400 && gift.body.error === 'not_for_crystals', JSON.stringify(gift.body));
  check('a free default is 400 not_for_crystals', (await spend(ana, { item_key: 'bg_obsidian' })).body.error === 'not_for_crystals');
  check('an unknown item is 404', (await spend(ana, { item_key: 'nope' })).status === 404);
  const noPassport = await spend(ana, { item_key: 'ink_violet', ref_id: crypto.randomUUID() });
  check('an ink without a minted certification is 409 passport_required', noPassport.status === 409 && noPassport.body.error === 'passport_required', JSON.stringify(noPassport.body));
  const short = await spend(ana, { item_key: 'bg_grape' });
  check('8 crystals do not buy a 75 background: 402 with balance and price', short.status === 402 && short.body.error === 'insufficient_crystals' && short.body.balance === 8 && short.body.price === 75, JSON.stringify(short.body));
  check('nothing was debited by the refusals', ledgerSum(ana) === 8);

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
  setLives(bia, 9);
  const lastSlot = await Promise.all([spend(bia, { item_key: 'life' }), spend(bia, { item_key: 'life' })]);
  check('two lives at once with room for one: one sold, one refused 409 not_needed', statuses(lastSlot) === '200,409', statuses(lastSlot));
  check('…no crystal lost: 10 lives, 5 crystals left', livesOf(bia) === 10 && ledgerSum(bia) === 5 && (await bia.get('crystals')).body.balance === 5, `${livesOf(bia)} lives, ${ledgerSum(bia)} crystals`);
  check('every balance equals the sum of its ledger', psql(`select count(*) from itera.crystal_accounts a where a.balance <> (select coalesce(sum(delta), 0) from itera.crystal_ledger l where l.user_id = a.user_id);`) === '0');


  console.log('\n== shop v3: lives packs, infinite lives ==');
  const cy = await newLearner(apikey, 'cy');
  grant(cy, 1200, `${RUN}-cy`);
  const listing = await cy.get('shop-items');
  const listed = (key) => listing.body.find?.((entry) => entry.key === key);
  check('GET /shop-items lists the packs with effect and crystal price', listed('lives_30')?.effect?.add_lives === 30 && listed('lives_30')?.price_crystals === 100 && listed('lives_infinite')?.effect?.unlimited_days === 30 && listed('life_refill')?.price_crystals === 30, JSON.stringify(listed('lives_30') ?? null).slice(0, 200));
  check('every listed item carries price_crystals and the two resolved currency flags', listing.body.every((entry) => 'price_crystals' in entry && typeof entry.sol_enabled === 'boolean' && typeof entry.crystals_enabled === 'boolean'));
  check('backgrounds and for-sale borders are listed for SOL; signature borders are sold in neither currency', listed('bg_midnight')?.sol_enabled === true && listed('border_bronze')?.sol_enabled === true && listed('border_sol')?.sol_enabled === false && listed('border_sol')?.crystals_enabled === false && listed('border_sol')?.included_with === 'special_dourado');
  const room = await spend(cy, { item_key: 'lives_10' });
  check('a 10-lives pack on a full learner ADDS 10 above the maximum (20 of 10)', room.status === 200 && room.body.lives?.current === 20 && room.body.lives?.max === 10 && room.body.lives?.bonus === 10 && room.body.balance === 1160 && room.body.lives?.unlimited_until === null, JSON.stringify(room.body.lives));
  check('the plain refill is still refused above the maximum (409 not_needed)', (await spend(cy, { item_key: 'life_refill' })).body.error === 'not_needed');
  const activity = psql(`select id from itera.activities where status = 'published' limit 1;`);
  const lost = await cy.call('lives', { action: 'lose', attempt_id: `${RUN}-l1`, activity_id: activity });
  check('with a reserve a mistake takes one of the 20', lost.status === 200 && lost.body.lives?.current === 19, JSON.stringify(lost.body.lives));
  const infinite = await spend(cy, { item_key: 'lives_infinite' });
  const unlimitedAt = Date.parse(infinite.body.lives?.unlimited_until ?? '');
  check('infinite lives: 1000 crystals, unlimited_until about 30 days ahead', infinite.status === 200 && infinite.body.balance === 160 && Math.abs(unlimitedAt - (Date.now() + 30 * 86400000)) < 120000, JSON.stringify(infinite.body.lives));
  const costless = await cy.call('lives', { action: 'lose', attempt_id: `${RUN}-l2`, activity_id: activity });
  check('during infinite lives a mistake costs nothing', costless.status === 200 && costless.body.lives?.current === 19 && costless.body.lives?.unlimited_until === infinite.body.lives.unlimited_until, JSON.stringify(costless.body.lives));
  check('the companion answer carries unlimited_until too', (await cy.call('companion', {})).body.lives?.unlimited_until === infinite.body.lives.unlimited_until);

  console.log('\n== shop v3: avatars with crystals, includes, borders, seasons ==');
  const seeded = Number(psql(`select balance from itera.crystal_accounts where user_id = :'user_id'::uuid;`, { user_id: cy.userId }));
  grant(cy, 150 + 2500 + 100 - seeded, `${RUN}-cy2`);
  const common = await spend(cy, { item_key: 'base_estudioso' });
  check('a common avatar for 150 crystals answers with the minted asset and includes nothing', common.status === 200 && common.body.avatar?.key === 'base_estudioso' && common.body.avatar.asset_address && common.body.avatar.serial >= 1 && common.body.avatar.includes?.length === 0, JSON.stringify(common.body).slice(0, 240));
  const avatarRow = psql(`select mint_status || '|' || coalesce(asset_address, '') || '|' || (purchase_id is not null) from itera.avatar_assets where user_id = :'user_id'::uuid and item_key = 'base_estudioso';`, { user_id: cy.userId });
  check('…there is an avatar_assets row, minted, with an asset and a paid crystal purchase behind it', avatarRow.startsWith('minted|') && avatarRow.endsWith('|true') && avatarRow.split('|')[1] === common.body.avatar.asset_address, avatarRow);
  check('…the same avatar again is 409 already_owned, nothing debited', (await spend(cy, { item_key: 'base_estudioso' })).body.error === 'already_owned');
  const epic = await spend(cy, { item_key: 'special_prata' });
  check('an epic avatar for 2 500 crystals is minted and grants its signature border', epic.status === 200 && epic.body.avatar?.tier_name === 'Mega Tera' && epic.body.avatar.includes?.[0]?.key === 'border_luan' && epic.body.avatar.asset_address, JSON.stringify(epic.body.avatar ?? epic.body).slice(0, 240));
  const ownedBorder = (await cy.get('crystals')).body.theme_items.find((item) => item.key === 'border_luan');
  check('…the border is owned, not equipped, not for sale, and says what it comes with', ownedBorder?.owned === true && ownedBorder.equipped === false && ownedBorder.for_sale === false && ownedBorder.included_with === 'special_prata', JSON.stringify(ownedBorder ?? null));
  const wornBorder = await cy.call('crystals/equip', { border: 'border_luan' });
  check('…and it can be equipped', wornBorder.status === 200 && wornBorder.body.theme?.border?.key === 'border_luan' && wornBorder.body.theme.border.border?.style === 'gradient', JSON.stringify(wornBorder.body));
  const wearing = await cy.call('companion', { equip: { avatar: 'special_prata' } });
  check('companion.avatar.border shows the equipped border', wearing.status === 200 && wearing.body.avatar?.key === 'special_prata' && wearing.body.avatar.border?.style === 'gradient' && wearing.body.avatar.border.colors?.length === 2, JSON.stringify(wearing.body.avatar ?? wearing.body).slice(0, 240));
  check('a border not owned cannot be equipped (409 not_owned)', (await cy.call('crystals/equip', { border: 'border_bronze' })).body.error === 'not_owned');
  const unworn = await cy.call('crystals/equip', { border: 'border_none' });
  check('the default border takes it off: companion.avatar.border is null again', unworn.status === 200 && (await cy.call('companion', {})).body.avatar?.border === null);
  check('the signature border is not for sale in crystals (400 not_for_crystals)', (await spend(cy, { item_key: 'border_sol' })).body.error === 'not_for_crystals');
  check('the gift is crystals-disabled (400 not_for_crystals)', (await spend(cy, { item_key: 'life_gift' })).body.error === 'not_for_crystals');
  const thin = await spend(cy, { item_key: 'special_dourado' });
  check('an epic avatar needs 2 500: 402 with the price', thin.status === 402 && thin.body.price === 2500, JSON.stringify(thin.body));
  const legend = await spend(cy, { item_key: 'base_guerreiro' });
  // This build keeps the legendary and mythic avatars off the shelf (`shop_items.active = false`, a data flag): refused before any price.
  check('a legendary avatar is off the shelf on this build: item_inactive, no price', legend.status >= 400 && legend.body.error === 'item_inactive' && legend.body.price === undefined, JSON.stringify(legend.body));
  const bronze = await spend(cy, { item_key: 'border_bronze' });
  check('a for-sale border costs 100 crystals and does not equip itself', bronze.status === 200 && bronze.body.item?.kind === 'border' && bronze.body.theme?.border?.key === 'border_none', JSON.stringify(bronze.body).slice(0, 200));

  console.log('\n== refunded crystal purchase (M1) ==');
  const mia = await newLearner(apikey, 'mia');
  grant(mia, 150, `${RUN}-mia`);
  // The state a refund leaves behind: a purchase row marked refunded and never applied, its debit, and the credit back
  // keyed by the purchase id, as `refundCrystalPurchase` writes it. (A credit under any other key reads as "not paid
  // yet" and `reconcileRefunds` pays it: that is its contract, and it is what this seed used to trip over.)
  psql(
    `with refunded as (
       insert into itera.purchases (user_id, item_key, ref_id, lamports, price_usd_cents, status, source, wallet, memo, expires_at, paid_at, refunded_at, error)
       values (:'u'::uuid, 'base_criativo', '00000000-0000-0000-0000-000000000000', 0, 0, 'refunded', 'crystals', :'w', 'base_criativo:00000000-0000-0000-0000-000000000000', now(), now(), now(), 'sold_out_after_payment')
       returning id)
     insert into itera.crystal_ledger (user_id, delta, reason, ref_id)
     select :'u'::uuid, -150, 'spend', 'base_criativo:00000000-0000-0000-0000-000000000000'
     union all select :'u'::uuid, 150, 'refund', id::text from refunded;`,
    { u: mia.userId, w: mia.address },
  );
  const retry = await spend(mia, { item_key: 'base_criativo' });
  check('after a refund the same request is a NEW debit (150), not a free re-apply', retry.status === 200 && retry.body.avatar?.key === 'base_criativo' && retry.body.balance === 0, JSON.stringify(retry.body).slice(0, 200));
  check('…the refunded row stays refunded and unapplied, a second paid row exists, and 2 debits are in the ledger', psql(`select count(*) filter (where status = 'refunded' and applied_at is null) || '|' || count(*) filter (where status = 'paid' and applied_at is not null) from itera.purchases where user_id = :'u'::uuid and item_key = 'base_criativo';`, { u: mia.userId }) === '1|1' && ledgerCount(mia, 'spend', 'base_criativo:%') === 2);
  const afterRead = (await mia.get('crystals')).body.balance;
  check('…and reading the balance afterwards pays nothing back: balance = ledger = 0', afterRead === 0 && ledgerSum(mia) === 0 && ledgerCount(mia, 'refund', '%') === 1, `balance ${afterRead}, ledger ${ledgerSum(mia)}, refunds ${ledgerCount(mia, 'refund', '%')}`);
  // The other half of the contract: a refunded purchase whose credit never landed is paid once, by the next read.
  const zoe = await newLearner(apikey, 'zoe');
  grant(zoe, 150, `${RUN}-zoe`);
  psql(
    `insert into itera.purchases (user_id, item_key, ref_id, lamports, price_usd_cents, status, source, wallet, memo, expires_at, paid_at, refunded_at, error)
     values (:'u'::uuid, 'base_criativo', '00000000-0000-0000-0000-000000000000', 0, 0, 'refunded', 'crystals', :'w', 'base_criativo:00000000-0000-0000-0000-000000000000', now(), now(), now(), 'sold_out_after_payment');
     insert into itera.crystal_ledger (user_id, delta, reason, ref_id) values (:'u'::uuid, -150, 'spend', 'base_criativo:00000000-0000-0000-0000-000000000000');
     update itera.crystal_accounts set balance = balance - 150 where user_id = :'u'::uuid;`,
    { u: zoe.userId, w: zoe.address },
  );
  const repaid = (await zoe.get('crystals')).body.balance;
  const rereadZoe = (await zoe.get('crystals')).body.balance;
  check('a refund whose credit never landed is paid by the next read, once', repaid === 150 && rereadZoe === 150 && ledgerSum(zoe) === 150 && ledgerCount(zoe, 'refund', '%') === 1, `first read ${repaid}, second ${rereadZoe}, ledger ${ledgerSum(zoe)}, refunds ${ledgerCount(zoe, 'refund', '%')}`);

  console.log('\n== shop v3: seasons and the SOL rail ==');
  const natal = await spend(cy, { item_key: 'event_natal' });
  // The seasonal avatars are legendary, so on this build they are off the shelf whatever the season: the season rule is not reachable from outside.
  check('a seasonal (legendary) avatar is refused for crystals: item_inactive', natal.status >= 400 && natal.body.error === 'item_inactive', JSON.stringify(natal.body));
  const intent = await cy.call('purchase-intent', { item_key: 'event_verao' });
  check('…and for SOL: purchase-intent refuses it as item_inactive (before any funds check)', intent.status >= 400 && intent.body.error === 'item_inactive', JSON.stringify(intent.body));
  const listedNatal = (await cy.get('shop-items')).body.find((entry) => entry.key === 'event_natal');
  check('…and the public list does not offer it', listedNatal === undefined, JSON.stringify(listedNatal ?? null));
  const solBorder = await cy.call('purchase-intent', { item_key: 'border_circuit' });
  check('a for-sale border is on the SOL rail (this wallet has no SOL: 402 insufficient_funds)', solBorder.status === 402, JSON.stringify(solBorder.body));
  const solSignature = await cy.call('purchase-intent', { item_key: 'border_sol' });
  check('a signature border is not sold for SOL: 409 currency_disabled', solSignature.status === 409 && solSignature.body.error === 'currency_disabled', JSON.stringify(solSignature.body));
  const solBg = await cy.call('purchase-intent', { item_key: 'bg_grape' });
  check('a background is on the SOL rail now (402 insufficient_funds for an empty wallet)', solBg.status === 402, JSON.stringify(solBg.body));
  check('the balance equals the ledger after the avatars', (await cy.get('crystals')).body.balance === ledgerSum(cy));

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
    check('a spend after the mirror answers at once', burnt.status === 200 && burnt.body.balance === 3, JSON.stringify(burnt.body).slice(0, 100));
    const after = await until(() => ana.get('crystals'), (answer) => answer.body.mirrored === true && answer.body.balance === 3, 40, 3000);
    check('…and the 5 crystals are burnt by the permanent delegate, the learner signing nothing', (await tokenAmount(after.body.token_account)) === 3, `chain ${await tokenAmount(after.body.token_account)}`);
  }

  console.log('\n== protected accounts ==');
  const touched = protectedLedgerRows();
  check('this run moved no crystal of the owner or of the demo account', touched === protectedBefore, `${protectedBefore} ledger rows before, ${touched} after`);

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
