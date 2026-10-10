#!/usr/bin/env node
// One-off backfill of Phoenix Crystals for every learner, from the award rows the server already holds
// (stamped days, trails, streak, podium places, invites) and the clean-lesson rule: the SAME pure functions
// `passport` reconciles with (`_shared/crystals.ts`). Idempotent: the ledger key (user, reason, ref) makes a re-run free.
//
//   node scripts/hackathon/crystals-backfill.mjs            # dry run: counts per reason, writes nothing
//   node scripts/hackathon/crystals-backfill.mjs --apply    # grants (the daily lesson cap is bypassed: these were earned earlier)
//
// Environment: source ~/.config/itera-hackathon/supabase.env (HACKATHON_DB_PASSWORD). Hackathon project only.
import { EARN_RULES, cleanLessonIds, earningsOfRows, missingEarnings } from '../../supabase/functions/_shared/crystals.ts';
import { PROJECT_REF, psql } from './social-e2e.lib.mjs';

const apply = process.argv.includes('--apply');
const TIME_ZONE = 'America/Sao_Paulo';
const amount = Object.fromEntries(EARN_RULES.map((rule) => [rule.reason, rule.crystals]));
console.log(`project ${PROJECT_REF} · ${apply ? 'APPLY' : 'dry run'}`);

const json = (sql) => JSON.parse(psql(`select coalesce(json_agg(t), '[]') from (${sql}) t;`));
const awards = json(`select user_id, achievement_key, ref_id, earned_at from itera.user_achievements
  where achievement_key in ('day_stamp','trail_complete','streak_7','podium_1','podium_2','podium_3','friend_brought','invited')`);
const activities = json(`select id, lesson_id from itera.activities where status = 'published'`);
const losses = json(`select user_id, activity_id, created_at from itera.life_events where kind = 'lose'`);
const ledger = json(`select user_id, reason, ref_id from itera.crystal_ledger`);

const by = (rows) => rows.reduce((map, row) => map.set(row.user_id, [...(map.get(row.user_id) ?? []), row]), new Map());
const awardsOf = by(awards);
const lossesOf = by(losses);
const paidOf = by(ledger);

const counts = {};
const perUser = new Map();
let total = 0;
for (const [userId, rows] of awardsOf) {
  const stamps = rows.filter((row) => row.achievement_key === 'day_stamp').map((row) => ({ lessonId: row.ref_id, earnedAt: row.earned_at }));
  const clean = cleanLessonIds(stamps, activities, lossesOf.get(userId) ?? [], TIME_ZONE);
  const paid = new Set((paidOf.get(userId) ?? []).map((entry) => `${entry.reason}|${entry.ref_id}`));
  const missing = missingEarnings(earningsOfRows(rows, clean), paid);
  perUser.set(userId, missing);
  for (const earning of missing) {
    counts[earning.reason] = (counts[earning.reason] ?? 0) + 1;
    total += amount[earning.reason];
  }
}
console.log(`learners with awards: ${awardsOf.size} · with something to pay: ${[...perUser.values()].filter((list) => list.length > 0).length}`);
console.log('to pay, per reason:', JSON.stringify(counts), `· ${total} crystals`);

if (apply) {
  let granted = 0;
  for (const [userId, missing] of perUser) {
    for (const earning of missing) {
      const answer = psql(`select is_new from itera.crystal_grant(:'u'::uuid, :amount, :'reason', :'ref', true);`, { u: userId, amount: String(amount[earning.reason]), reason: earning.reason, ref: earning.refId });
      if (answer === 't') granted += 1;
    }
  }
  console.log(`granted ${granted} earnings`);
}
