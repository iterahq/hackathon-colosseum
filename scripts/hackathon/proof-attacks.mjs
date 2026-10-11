#!/usr/bin/env node
// Proof of learning against the LIVE hackathon project: a completion comes only from an answer the
// server graded. Forged writes and forged claims stamp nothing; a real run of day 1 is stamped and
// its stamp says how many answers the server verified.
//
//   node scripts/hackathon/proof-attacks.mjs            # forge + honest
//   node scripts/hackathon/proof-attacks.mjs forge      # only the attacks (0 SOL: nothing is awarded)
//   node scripts/hackathon/proof-attacks.mjs honest     # one real day: mints the certification (about 0.01 SOL of the authority)
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN.
// Leaves throwaway wallet learners behind.
import { resolveSpec } from '../../supabase/functions/_shared/grading.ts';
import { authoredLesson, correctSubmission, firstLessonOf } from './day-solver.lib.mjs';
import { FUNCTIONS, SUPABASE_URL, anonKey, check, newLearner, psql, sleep, summary, tagOwnLearners } from './social-e2e.lib.mjs';

const HONEST_PACE_MS = 1_500;
const BLANK_TOKEN = /\{\{blank:([^{}]*)\}\}/g;

async function restAs(learner, method, path, body, prefer) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...learner.headers, 'Content-Profile': 'itera', 'Accept-Profile': 'itera', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } catch {
    return { status: response.status, body: text };
  }
}

/** Day 1 as AUTHORED, answer key included: read with the database password. A learner's session cannot read it (see answer-key-attacks.mjs). */
function dayOne() {
  const lesson = firstLessonOf();
  const activities = authoredLesson(lesson);
  if (activities.length === 0) throw new Error('could not read day 1');
  return { lesson, activities };
}

const grade = (learner, activity, submission, passed = true) => learner.call('grade', { activity_id: activity.id, passed, results: 'server', ...submission });
const progressStatus = (userId, activityId) => psql(`select coalesce((select status::text from itera.progress where user_id = :'user_id'::uuid and activity_id = :'activity'::uuid), 'none');`, { user_id: userId, activity: activityId });
const attemptCount = (userId) => Number(psql(`select count(*) from itera.graded_attempts where user_id = :'user_id'::uuid;`, { user_id: userId }));
const achievementCount = (userId) => Number(psql(`select count(*) from itera.user_achievements where user_id = :'user_id'::uuid;`, { user_id: userId }));

async function forge(context) {
  const forger = await newLearner(context.apikey, 'forger');
  const { lesson, activities } = dayOne();
  const choice = activities.find((activity) => activity.kind === 'single_choice');
  const code = activities.find((activity) => activity.kind === 'code_editor_checks');
  const fill = activities.find((activity) => activity.kind.startsWith('code_fill'));

  // 1. The old attack: the browser writes the completion itself.
  const rows = activities.map((activity) => ({ user_id: forger.userId, activity_id: activity.id, status: 'completed', completed_at: new Date().toISOString() }));
  const direct = await restAs(forger, 'POST', 'progress?on_conflict=user_id,activity_id', rows, 'resolution=merge-duplicates');
  const written = Number(psql(`select count(*) from itera.progress where user_id = :'user_id'::uuid and status = 'completed';`, { user_id: forger.userId }));
  check('a completion written by the client is refused by the database', direct.status >= 400 && written === 0, `HTTP ${direct.status} ${JSON.stringify(direct.body).slice(0, 140)} · completed rows ${written}`);
  const started = await restAs(forger, 'POST', 'progress?on_conflict=user_id,activity_id', { user_id: forger.userId, activity_id: choice.id, status: 'in_progress', completed_at: null }, 'resolution=ignore-duplicates');
  const promoted = await restAs(forger, 'PATCH', `progress?user_id=eq.${forger.userId}&activity_id=eq.${choice.id}`, { status: 'completed', completed_at: new Date().toISOString() });
  check('an in_progress row is allowed, promoting it to completed is not', started.status < 300 && promoted.status >= 400 && progressStatus(forger.userId, choice.id) === 'in_progress', `${started.status} ${promoted.status} ${progressStatus(forger.userId, choice.id)}`);
  const fakeAttempt = await restAs(forger, 'POST', 'graded_attempts', { user_id: forger.userId, activity_id: choice.id, lesson_id: lesson, kind: 'single_choice', mode: 'server', passed: true, claimed_passed: true, answer_hash: 'a'.repeat(64), spec_hash: 'b'.repeat(64), grader: 'v1' });
  check('a client cannot write the attempt log', fakeAttempt.status >= 400 && attemptCount(forger.userId) === 0, `HTTP ${fakeAttempt.status}`);
  const nothing = await forger.call('passport', { lang: 'en', lesson_id: lesson });
  check('passport after the forged writes: no award, no mint', nothing.status === 200 && nothing.body.awards.length === 0 && nothing.body.mint.attempted === 0 && achievementCount(forger.userId) === 0, JSON.stringify(nothing.body).slice(0, 160));

  // 2. The new surface: lying to the grader.
  const wrongOption = resolveSpec(choice.spec, 'pt').options.find((option) => option.id !== choice.spec.correct_option_id).id;
  const wrong = await grade(forger, choice, { answer: { option_ids: [wrongOption] }, response: null });
  check('"I passed" with the wrong option: the server says fail', wrong.status === 200 && wrong.body.verdict === 'fail' && wrong.body.mode === 'server' && wrong.body.reason === 'answer_rejected' && progressStatus(forger.userId, choice.id) === 'in_progress', JSON.stringify(wrong.body));
  const bare = await grade(forger, choice, { answer: null, response: null });
  check('"I passed" with no answer: fail (answer_required)', bare.body.verdict === 'fail' && bare.body.reason === 'answer_required', JSON.stringify(bare.body));
  const template = await grade(forger, code, { answer: null, response: resolveSpec(code.spec, 'pt').starter });
  check('a code exercise sent back unchanged: fail', template.body.verdict === 'fail' && template.body.mode === 'server' && progressStatus(forger.userId, code.id) !== 'completed', JSON.stringify(template.body));
  const badFill = await grade(forger, fill, { answer: null, response: resolveSpec(fill.spec, 'pt').starter.replace(BLANK_TOKEN, 'x') });
  check('a template filled with the wrong words: fail', badFill.body.verdict === 'fail' && badFill.body.reason === 'answer_rejected', JSON.stringify(badFill.body));
  const anonymous = await fetch(`${FUNCTIONS}/grade`, { method: 'POST', headers: { apikey: context.apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ activity_id: choice.id, passed: true, answer: { option_ids: [choice.spec.correct_option_id] } }) });
  const unknown = await forger.call('grade', { activity_id: '00000000-0000-4000-8000-000000000000', passed: true });
  const malformed = await forger.call('grade', { activity_id: choice.id, passed: 'yes' });
  check('no session 401 · unknown activity 404 · malformed body 400', anonymous.status === 401 && unknown.status === 404 && malformed.status === 400, `${anonymous.status} ${unknown.status} ${malformed.status}`);

  // 3. A forger who somehow holds the answer keys (the player no longer ships them) and sends them in one burst.
  const burst = await newLearner(context.apikey, 'burst');
  for (const activity of activities) await grade(burst, activity, correctSubmission(activity));
  const done = Number(psql(`select count(*) from itera.progress where user_id = :'user_id'::uuid and status = 'completed';`, { user_id: burst.userId }));
  const rushed = await burst.call('passport', { lang: 'en', lesson_id: lesson });
  check('correct answers sent in one burst: recorded, but the day is held (too_fast), nothing awarded', done === activities.length && rushed.status === 200 && rushed.body.awards.length === 0 && rushed.body.day_pending_review?.reason === 'too_fast', `${done}/${activities.length} ${JSON.stringify(rushed.body.day_pending_review ?? null)}`);
}

async function honest(context) {
  const learner = await newLearner(context.apikey, 'honest');
  const { lesson, activities } = dayOne();
  const firstChoice = activities.find((activity) => activity.kind === 'single_choice');
  const startedAt = Date.now();
  const modes = { server: 0, self_reported: 0, participation: 0 };
  let slowest = 0;
  for (const activity of activities) {
    if (activity.id === firstChoice.id) {
      // A real learner misses sometimes: the miss is recorded and completes nothing.
      const other = resolveSpec(activity.spec, 'pt').options.find((option) => option.id !== activity.spec.correct_option_id).id;
      const miss = await grade(learner, activity, { answer: { option_ids: [other] }, response: null }, false);
      check('honest: a miss is recorded as a miss', miss.body.verdict === 'fail' && progressStatus(learner.userId, activity.id) === 'in_progress', JSON.stringify(miss.body));
    }
    const sent = Date.now();
    const answer = await grade(learner, activity, correctSubmission(activity));
    slowest = Math.max(slowest, Date.now() - sent);
    if (answer.body.verdict !== 'pass') check(`honest: ${activity.kind} ${activity.id} graded as pass`, false, JSON.stringify(answer.body));
    else modes[answer.body.mode] += 1;
    await sleep(HONEST_PACE_MS);
  }
  console.log(`honest day: ${activities.length} activities in ${((Date.now() - startedAt) / 1000).toFixed(1)} s · slowest grade call ${slowest} ms · ${JSON.stringify(modes)}`);
  const graded = modes.server + modes.self_reported;
  check('honest: every activity passed, most of the graded ones on the server', modes.server + modes.self_reported + modes.participation === activities.length && modes.server >= 8, JSON.stringify(modes));
  const writer = psql(`select count(*) filter (where written_by_client) || '/' || count(*) from itera.progress where user_id = :'user_id'::uuid and status = 'completed';`, { user_id: learner.userId });
  check('honest: every completion was written by the server', writer === `0/${activities.length}`, writer);

  const played = await learner.call('passport', { lang: 'en', lesson_id: lesson });
  const keys = (played.body.awards ?? []).map((award) => award.key).sort();
  check('honest: the day is stamped', played.status === 200 && ['day_stamp', 'first_stamp', 'trail_pass'].every((key) => keys.includes(key)) && !('day_pending_review' in played.body), `${keys.join(',')} ${JSON.stringify(played.body.day_pending_review ?? null)}`);
  const proofOf = (key) => JSON.parse(psql(`select coalesce((select state->'proof' from itera.user_achievements where user_id = :'user_id'::uuid and achievement_key = :'key' limit 1), 'null'::jsonb);`, { user_id: learner.userId, key }));
  const stamp = proofOf('day_stamp');
  const pass = proofOf('trail_pass');
  const expected = { verified: modes.server, self_reported: modes.self_reported, participation: modes.participation, legacy: 0 };
  const sameCounts = (proof) => proof && Object.entries(expected).every(([field, value]) => proof[field] === value) && /^[0-9a-f]{64}$/.test(proof.evidence);
  check(`honest: the stamp states ${modes.server}/${graded} server-verified, with an evidence hash`, sameCounts(stamp) && sameCounts(pass), `${JSON.stringify(stamp)} ${JSON.stringify(pass)}`);

  const asset = psql(`select coalesce(asset_address, '') from itera.user_achievements where user_id = :'user_id'::uuid and achievement_key = 'trail_pass' limit 1;`, { user_id: learner.userId });
  check('honest: the certification was minted', played.body.mint.attempted > 0 && asset.length > 30, `${JSON.stringify(played.body.mint)} asset ${asset}`);
  if (!asset) return;
  await sleep(4_000);
  const verified = await (await fetch(`${FUNCTIONS}/credential-verify/${asset}?lang=en`, { headers: { apikey: context.apikey, Authorization: `Bearer ${context.apikey}` } })).json();
  const onchain = (verified.onchain?.attributes ?? verified.attributes ?? []).find((entry) => entry.key === 'server_verified')?.value;
  check(`honest: the asset carries server_verified = ${modes.server}/${graded} on chain`, onchain === `${modes.server}/${graded}`, `asset ${asset} · ${JSON.stringify(onchain ?? verified).slice(0, 200)}`);
  const claims = psql(`select count(*) || '|' || count(*) filter (where evidence::jsonb->>'v' = '2' and evidence::jsonb->>'verified' = :'share') from itera.claim_proofs where user_achievement_id in (select id from itera.user_achievements where user_id = :'user_id'::uuid);`, { user_id: learner.userId, share: `${modes.server}/${graded}` });
  check('honest: the capability claims of the day carry the graded answers (evidence v2)', /^([1-9]\d*)\|\1$/.test(claims), claims);
  console.log(`asset ${asset} · https://explorer.solana.com/address/${asset}?cluster=devnet`);
}

const SECTIONS = { forge, honest };

async function main() {
  const wanted = process.argv.slice(2);
  const names = wanted.length > 0 ? wanted : Object.keys(SECTIONS);
  const unknown = names.filter((name) => !SECTIONS[name]);
  if (unknown.length > 0) throw new Error(`unknown section(s): ${unknown.join(', ')}`);
  const context = { apikey: await anonKey() };
  for (const name of names) {
    console.log(`\n=== ${name} ===`);
    await SECTIONS[name](context);
  }
  tagOwnLearners('proof-attacks');
  const { total, failed } = summary();
  console.log(`\n${total - failed.length}/${total} checks passed${failed.length ? `\nFAILED:\n  ${failed.join('\n  ')}` : ''}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('proof-attacks failed:', error);
  process.exit(1);
});
