// Feature 1: `outfit_laurel` is bought OR claimed for free at level 5; both paths end in the same inventory.
import { FUNCTIONS, check, newLearner, psql, seedXp } from './social-e2e.lib.mjs';

const laurelOf = (items) => (Array.isArray(items) ? items.find((item) => item.key === 'outfit_laurel') : undefined);
const claimRows = (userId) =>
  psql(`select count(*) || '|' || coalesce(max(lamports), -1) || '|' || coalesce(max(status), '') from itera.purchases where user_id = :'user_id'::uuid and item_key = 'outfit_laurel' and source = 'claim';`, { user_id: userId });

export async function laurel({ apikey }) {
  const learner = await newLearner(apikey, 'laurel learner');

  const anonymous = await (await fetch(`${FUNCTIONS}/shop-items?lang=en`, { headers: { apikey } })).json();
  check('shop-items (visitor): the laurel says level 5, no current level, locked', JSON.stringify(laurelOf(anonymous)?.unlock) === JSON.stringify({ level: 5, current_level: null, unlocked: false }), JSON.stringify(laurelOf(anonymous)?.unlock));
  check('shop-items: no other item carries `unlock`, and the laurel keeps its price', anonymous.filter((item) => item.unlock).length === 1 && laurelOf(anonymous).price_lamports === 2750000);

  const noToken = await fetch(`${FUNCTIONS}/shop-claim`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ item_key: 'outfit_laurel' }) });
  check('shop-claim without a session: 401', noToken.status === 401, noToken.status);

  const early = laurelOf((await learner.get('shop-items?lang=en')).body);
  check('shop-items (level 1): locked with current_level 1', early?.unlock?.current_level === 1 && early.unlock.unlocked === false && early.owned === false, JSON.stringify(early?.unlock));
  const locked = await learner.call('shop-claim', { item_key: 'outfit_laurel' });
  check('shop-claim below the level: 409 locked, with the progress', locked.status === 409 && locked.body.error === 'locked' && locked.body.unlock?.level === 5 && locked.body.unlock.current_level === 1, JSON.stringify(locked.body));
  check('shop-claim below the level: nothing granted', claimRows(learner.userId) === '0|-1|' && psql(`select count(*) from itera.user_inventory where user_id = :'user_id'::uuid;`, { user_id: learner.userId }) === '0');
  const paidOnly = await learner.call('shop-claim', { item_key: 'outfit_crown' });
  check('shop-claim of an item that is only sold: 409 not_claimable', paidOnly.status === 409 && paidOnly.body.error === 'not_claimable', JSON.stringify(paidOnly.body));
  const unknown = await learner.call('shop-claim', { item_key: 'outfit_nope' });
  check('shop-claim of an unknown item: 404', unknown.status === 404 && unknown.body.error === 'item_not_found');
  const malformed = await learner.call('shop-claim', { item: 'outfit_laurel' });
  check('shop-claim with a malformed body: 400', malformed.status === 400 && malformed.body.error === 'invalid_body');

  seedXp(learner.userId, 799);
  const almost = await learner.call('shop-claim', { item_key: 'outfit_laurel' });
  check('799 xp is level 4: still locked', almost.status === 409 && almost.body.unlock?.current_level === 4, JSON.stringify(almost.body));
  seedXp(learner.userId, 1);
  const ready = laurelOf((await learner.get('shop-items?lang=en')).body);
  check('shop-items (800 xp): level 5, unlocked, not owned yet', ready?.unlock?.current_level === 5 && ready.unlock.unlocked === true && ready.owned === false, JSON.stringify(ready?.unlock));

  const claimed = await learner.call('shop-claim', { item_key: 'outfit_laurel', lang: 'en' });
  check('shop-claim at level 5: 200 claimed', claimed.status === 200 && claimed.body.status === 'claimed' && claimed.body.already_owned === false && claimed.body.item?.title === 'Golden laurel', JSON.stringify(claimed.body).slice(0, 200));
  check('shop-claim: the answer carries inventory, lives and companion', claimed.body.inventory?.some((entry) => entry.item_key === 'outfit_laurel' && entry.qty === 1) && claimed.body.lives?.max === 5 && claimed.body.companion?.level === 5);
  check('claim recorded as one paid purchase of zero lamports', claimRows(learner.userId) === '1|0|paid', claimRows(learner.userId));

  const again = await learner.call('shop-claim', { item_key: 'outfit_laurel' });
  check('shop-claim again: 200, already_owned, nothing new', again.status === 200 && again.body.already_owned === true && claimRows(learner.userId) === '1|0|paid' && psql(`select qty from itera.user_inventory where user_id = :'user_id'::uuid and item_key = 'outfit_laurel';`, { user_id: learner.userId }) === '1');
  const buy = await learner.call('purchase-intent', { item_key: 'outfit_laurel' });
  check('buying it after the claim: 409 already_owned', buy.status === 409 && buy.body.error === 'already_owned', JSON.stringify(buy.body));

  const own = await learner.rest('purchases?select=item_key,lamports,source,status');
  check('the learner reads the claim row (RLS: own rows)', Array.isArray(own) && own.length === 1 && own[0].source === 'claim' && own[0].lamports === 0, JSON.stringify(own).slice(0, 160));

  const equipped = await learner.call('companion', { equip: { outfit: 'outfit_laurel' } });
  check('equip the claimed laurel: same path as a bought outfit', equipped.status === 200 && equipped.body.companion?.outfit === 'outfit_laurel' && equipped.body.inventory?.some((entry) => entry.item_key === 'outfit_laurel' && entry.equipped), JSON.stringify(equipped.body.companion ?? equipped.body).slice(0, 160));
  const shown = laurelOf((await learner.get('shop-items?lang=en')).body);
  check('shop-items after: owned and equipped', shown?.owned === true && shown.equipped === true);
  return learner;
}
