#!/usr/bin/env node
// The lesson rules against the LIVE hackathon project: in the focus build a miss costs nothing; in the
// full build it costs a life on the server (once per activity per day, at most 3 per lesson per day).
// A pass costs nothing, and a visitor with no session has day 1 graded with nothing written.
//
//   node scripts/hackathon/lesson-rules-e2e.mjs
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN.
// 0 SOL. Leaves one throwaway wallet learner behind.
import { FUNCTIONS, anonKey, check, newLearner, psql, summary } from './social-e2e.lib.mjs';

const CHOICES = psql(
  `select coalesce(json_agg(json_build_object('id', a.id, 'key', a.spec->>'correct_option_id', 'wrong', (select o->>'id' from jsonb_array_elements(a.spec->'options') o where o->>'id' <> a.spec->>'correct_option_id' limit 1)) order by a.ordinal), '[]')
   from itera.activities a where a.lesson_id = '0e7d6618-f9ba-46ba-bf28-71cf86f32716' and a.kind = 'single_choice' and a.status = 'published';`,
);

// `ITERA_FOCUS_BUILD=off` in the environment checks the rules of the full build (a miss costs a life).
const FOCUS = process.env.ITERA_FOCUS_BUILD !== 'off';

async function main() {
  const apikey = await anonKey();
  const choices = JSON.parse(CHOICES);
  check('day 1 has at least 4 single-choice activities', choices.length >= 4, `${choices.length}`);
  const learner = await newLearner(apikey, 'rules');
  const lives = async () => Number(psql(`select coalesce((select lives from itera.companions where user_id = :'u'::uuid), 10);`, { u: learner.userId }));
  const miss = (c) => learner.call('grade', { activity_id: c.id, passed: false, response: null, answer: { option_ids: [c.wrong] } });
  const forged = (c) => learner.call('grade', { activity_id: c.id, passed: true, response: null, answer: { option_ids: [c.wrong] } });
  const pass = (c) => learner.call('grade', { activity_id: c.id, passed: true, response: null, answer: { option_ids: [c.key] } });

  const start = await lives();
  if (FOCUS) {
    // The focus build (the server's default): a miss is graded and recorded, and costs nothing.
    const first = await miss(choices[0]);
    check('a miss is a fail and takes no life', first.body.verdict === 'fail' && first.body.miss === undefined && first.body.lives === undefined, JSON.stringify(first.body));
    const lie = await forged(choices[1]);
    check('a forged pass is a fail and takes no life', lie.body.verdict === 'fail' && lie.body.miss === undefined, JSON.stringify(lie.body));
    for (const c of [choices[2], choices[3], choices[0]]) await miss(c);
    check('five misses later the lives are what they were', (await lives()) === start, `${await lives()} of ${start}`);
    check('no life event was written', psql(`select count(*) from itera.life_events where user_id = :'u'::uuid and kind = 'lose';`, { u: learner.userId }) === '0');
  } else {
    const first = await miss(choices[0]);
    check('a miss is charged by the server', first.body.verdict === 'fail' && first.body.miss?.charge === 'charged' && first.body.miss?.life_lost === true, JSON.stringify(first.body.miss));
    check('the answer carries the lives left', first.body.lives?.current === start - 1, `${first.body.lives?.current} of ${start}`);
    check('the database agrees', (await lives()) === start - 1);

    const again = await miss(choices[0]);
    check('the same activity is charged once a day', again.body.miss?.charge === 'already_charged' && again.body.lives?.current === start - 1, JSON.stringify(again.body.miss));

    const lie = await forged(choices[1]);
    check('a forged pass is a miss and costs a life', lie.body.verdict === 'fail' && lie.body.miss?.charge === 'charged' && lie.body.lives?.current === start - 2, JSON.stringify(lie.body));

    const third = await miss(choices[2]);
    check('third miss of the lesson is charged', third.body.miss?.charge === 'charged' && third.body.lives?.current === start - 3, JSON.stringify(third.body.miss));
    const fourth = await miss(choices[3]);
    check('the lesson cap stops the fourth', fourth.body.miss?.charge === 'lesson_cap' && fourth.body.miss?.life_lost === false && fourth.body.lives?.current === start - 3, JSON.stringify(fourth.body.miss));
    check('one lesson took 3 lives at most', (await lives()) === start - 3);

  }

  const right = await pass(choices[3]);
  check('a pass costs nothing and says nothing about lives', right.body.verdict === 'pass' && right.body.miss === undefined && right.body.lives === undefined);
  check('the pass is a completion', psql(`select status::text from itera.progress where user_id = :'u'::uuid and activity_id = :'a'::uuid;`, { u: learner.userId, a: choices[3].id }) === 'completed');

  const guestHeaders = { apikey, Authorization: `Bearer ${apikey}`, 'Content-Type': 'application/json' };
  const before = Number(psql(`select count(*) from itera.graded_attempts;`));
  const guest = await fetch(`${FUNCTIONS}/grade`, { method: 'POST', headers: guestHeaders, body: JSON.stringify({ activity_id: choices[0].id, passed: true, response: null, answer: { option_ids: [choices[0].key] } }) });
  const guestBody = await guest.json();
  check('a visitor has day 1 graded', guest.status === 200 && guestBody.verdict === 'pass' && guestBody.guest === true, JSON.stringify(guestBody));
  check('and nothing is written for it', Number(psql(`select count(*) from itera.graded_attempts;`)) === before);
  summary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
