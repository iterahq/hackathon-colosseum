#!/usr/bin/env node
// Live check of the refund path of Phoenix Crystals (review N1): a refunded purchase is never re-applied, a
// refunded purchase whose credit never landed is paid by the next GET /crystals, exactly once.
//   node scripts/hackathon/crystals-followup-e2e.mjs
// One throwaway wallet learner; one avatar mint (a few thousandths of SOL from the authority).
import { anonKey, balance, check, loadAuthority, newLearner, psql, sol, summary } from './social-e2e.lib.mjs';

const ledgerSum = (learner) => Number(psql(`select coalesce(sum(delta), 0) from itera.crystal_ledger where user_id = :'u'::uuid;`, { u: learner.userId }));
const ZERO = '00000000-0000-0000-0000-000000000000';

const authority = loadAuthority();
const before = await balance(authority.address);
console.log(`before: authority ${authority.address} ${sol(before)} SOL`);
const apikey = await anonKey();
const mia = await newLearner(apikey, 'refund');

console.log('\n== refunded purchase is not re-applied ==');
psql(
  `select itera.crystal_grant(:'u'::uuid, 150, 'e2e_seed', 'fu-1');
   insert into itera.crystal_ledger (user_id, delta, reason, ref_id) values (:'u'::uuid, -150, 'spend', 'base_criativo:${ZERO}');
   with refunded as (
     insert into itera.purchases (user_id, item_key, ref_id, lamports, price_usd_cents, status, source, wallet, memo, expires_at, paid_at, refunded_at, error)
     values (:'u'::uuid, 'base_criativo', '${ZERO}', 0, 0, 'refunded', 'crystals', :'w', 'base_criativo:${ZERO}', now(), now(), now(), 'sold_out_after_payment') returning id)
   insert into itera.crystal_ledger (user_id, delta, reason, ref_id) select :'u'::uuid, 150, 'refund', id::text from refunded;
   update itera.crystal_accounts set balance = 150 where user_id = :'u'::uuid;`,
  { u: mia.userId, w: mia.address },
);
const retry = await mia.call('crystals/spend', { item_key: 'base_criativo' });
check('the same request after a refund is a NEW debit and mints', retry.status === 200 && retry.body.avatar?.key === 'base_criativo' && retry.body.balance === 0, JSON.stringify(retry.body).slice(0, 160));
check('…the refunded row stays refunded and unapplied; a second row is paid and applied', psql(`select count(*) filter (where status = 'refunded' and applied_at is null) || '|' || count(*) filter (where status = 'paid' and applied_at is not null) from itera.purchases where user_id = :'u'::uuid and item_key = 'base_criativo';`, { u: mia.userId }) === '1|1');

console.log('\n== a refund whose credit never landed is paid by the next call, once ==');
const orphan = psql(
  `select itera.crystal_grant(:'u'::uuid, 150, 'e2e_seed', 'fu-2');
   insert into itera.purchases (user_id, item_key, ref_id, lamports, price_usd_cents, status, source, wallet, memo, expires_at, paid_at, refunded_at, error)
   values (:'u'::uuid, 'base_estudioso', '${ZERO}', 0, 0, 'refunded', 'crystals', :'w', 'base_estudioso:${ZERO}', now(), now(), now(), 'sold_out_after_payment') returning id;
   insert into itera.crystal_ledger (user_id, delta, reason, ref_id) values (:'u'::uuid, -150, 'spend', 'base_estudioso:${ZERO}');
   update itera.crystal_accounts set balance = balance - 150 where user_id = :'u'::uuid;`,
  { u: mia.userId, w: mia.address },
).split('\n').find((line) => /^[0-9a-f-]{36}$/.test(line));
const owed = (await mia.get('crystals')).body;
check('GET /crystals pays the missing refund (+150): balance 150 = ledger', owed.balance === 150 && ledgerSum(mia) === 150 && psql(`select count(*) from itera.crystal_ledger where user_id = :'u'::uuid and reason = 'refund' and ref_id = :'p'`, { u: mia.userId, p: orphan }) === '1', `${owed.balance} / ${ledgerSum(mia)}`);
await mia.get('crystals');
await mia.call('passport', {});
check('…and a second GET and a passport call pay nothing more', psql(`select count(*) from itera.crystal_ledger where user_id = :'u'::uuid and reason = 'refund' and ref_id = :'p'`, { u: mia.userId, p: orphan }) === '1');

const after = await balance(authority.address);
console.log(`\nauthority: ${sol(before)} -> ${sol(after)} SOL (${sol(after - before)})`);
const { total, failed } = summary();
console.log(`\n${total - failed.length}/${total} checks passed`);
if (failed.length > 0) process.exit(1);
