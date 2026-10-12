// The effort half of tera-e2e.mjs: "verified effort moves the odds", on the deployed backend. A learner
// whose every answer goes through the `grade` function plays day 1 with no miss, at a human pace. The
// server grades most of the day itself, so the chest must commit effort level 2 (one point for the
// server-graded share, one for the clean day; not the day that finishes the trail), and the roll must
// recompute, from the RPC alone, with the odds row of level 2.
import { commitLandedInTime, effortLevel, oddsOf, parseCommit, parsePoolDocument } from '../../supabase/functions/_shared/tera-roll.ts';
import { authoredLesson, correctSubmission, firstLessonOf } from './day-solver.lib.mjs';
import { check, sleep } from './bounty-e2e.lib.mjs';
import { anonKey, newLearner, psql, tagOwnLearners } from './social-e2e.lib.mjs';

/** Under this pace the plausibility floor holds the day (`too_fast`): a learner reads before answering. */
const PACE_MS = 1_500;

export async function effortPart({ report, recompute, attributesOf, transaction }) {
  const learner = await newLearner(await anonKey(), 'tera-e2e graded learner');
  tagOwnLearners('tera-e2e: graded learner');
  const lesson = firstLessonOf();
  const activities = authoredLesson(lesson);
  const modes = { server: 0, self_reported: 0, participation: 0 };
  for (const activity of activities) {
    const answer = await learner.call('grade', { activity_id: activity.id, passed: true, results: 'server', ...correctSubmission(activity) });
    if (answer.body?.verdict === 'pass') modes[answer.body.mode] += 1;
    else check(`the grader passes ${activity.kind}`, false, JSON.stringify(answer.body).slice(0, 160));
    await sleep(PACE_MS);
  }
  const gradable = modes.server + modes.self_reported;
  check('every answer of the day went through `grade`, most of the gradable ones graded by the server', modes.server + modes.self_reported + modes.participation === activities.length && gradable > 0 && modes.server / gradable >= 0.75, JSON.stringify(modes));
  const misses = Number(psql(`select count(*) from itera.graded_attempts where user_id = :'u'::uuid and not passed;`, { u: learner.userId }));
  check('the server recorded no miss for this learner', misses === 0);

  const started = Date.now();
  const stamped = await learner.call('passport', { lang: 'en', lesson_id: lesson, max_jobs: 1 });
  const row = [...(stamped.body?.awards ?? []), ...(stamped.body?.updated ?? [])].find((entry) => entry.key === 'trail_pass');
  check('the graded day is stamped', stamped.status === 200 && row?.mint_status === 'minted' && !('day_pending_review' in stamped.body), `${Date.now() - started} ms ${JSON.stringify(stamped.body?.day_pending_review ?? null)}`);
  const certification = row.asset_address;

  const commitText = (await attributesOf(certification)).attributes.get('chest:1');
  const commit = parseCommit(commitText);
  const expected = effortLevel({ verified: modes.server, gradable, clean: true, gold: false });
  check('ON CHAIN: the stamp committed effort level 2, the level of a server-graded day with no miss', commit?.level === 2 && expected === 2, commitText);
  const landed = await transaction(row.tx_signature);
  check('the commitment landed before the slot it names', commitLandedInTime(landed.slot, commit), `margin ${commit.slot - landed.slot} slots`);

  let chest = null;
  for (const end = Date.now() + 120_000; Date.now() < end; ) {
    const answer = await learner.call('tera-chest', { lesson_id: lesson });
    chest = answer.body?.chest;
    if (!chest || chest.status === 'minted' || chest.status === 'failed') break;
    await sleep(Math.min(Math.max(chest.retry_after_ms ?? 1500, 800), 6000));
  }
  check('its chest settles into a minted Tera', chest?.status === 'minted' && Boolean(chest?.tera?.asset), `${chest?.tera?.key} (${chest?.tier})`);
  check('the chest states the effort it was given for: the server-graded share, a clean day, not the last day', chest.level === 2 && chest.effort.verified === modes.server && chest.effort.gradable === gradable && chest.effort.clean === true && chest.effort.gold === false, JSON.stringify(chest.effort));

  const redo = await recompute(chest.id);
  const pool = parsePoolDocument(redo.published.recompute.pool_document);
  const row2 = oddsOf(2, pool.odds);
  const row0 = oddsOf(0, pool.odds);
  check('the odds the chest was rolled with are the row of level 2 of the pool it committed to', JSON.stringify(chest.odds) === JSON.stringify(row2) && JSON.stringify(redo.published.chest.odds) === JSON.stringify(row2));
  const upper = (odds) => odds.filter((entry) => entry.tier !== 'common').reduce((total, entry) => total + entry.weight, 0);
  check('verified effort moved the odds: level 2 gives every tier above common more weight than level 0', upper(row2) > upper(row0) && ['rare', 'epic', 'legendary', 'mythic'].every((tier) => row2.find((entry) => entry.tier === tier).weight > row0.find((entry) => entry.tier === tier).weight), `above common: ${upper(row0)} -> ${upper(row2)} of 10000`);
  check('recomputed from the RPC with the committed level, the roll gives the same Tera', redo.result.ok && redo.commit.level === 2 && redo.result.key === chest.tera.key && redo.result.tier === chest.tier, `${redo.result.key}, tier_roll ${redo.result.tier_roll}`);
  // The same seed read against the row of level 0: what this learner would have got without the verified effort.
  const { rollChest } = await import('../../supabase/functions/_shared/tera-roll.ts');
  const lazy = rollChest({ seed: redo.result.seed, level: 0, pool: pool.pool, unavailable: redo.published.recompute.unavailable, earnOnly: pool.earnOnly, odds: pool.odds });
  console.log(`      same seed at level 0 would have rolled ${lazy.rolled_tier}; at level 2 it rolled ${redo.result.rolled_tier}`);
  const tera = await attributesOf(chest.tera.asset);
  check('the earned Tera carries that commitment, level included', tera.attributes.get('chest') === commitText && tera.answer.frozen === true && tera.attributes.get('origin') === 'earned');
  report.effort = { wallet: learner.address, certification, chest: chest.id, commit: commitText, level: 2, modes, tera: chest.tera.key, tier: chest.tier, rolled_tier: redo.result.rolled_tier, tier_roll: redo.result.tier_roll, at_level_0: lazy.rolled_tier, asset: chest.tera.asset };
}
