#!/usr/bin/env node
// The landing's first path against the LIVE hackathon project: a visitor does day 1 with no account
// (graded, nothing written), signs in with a fresh wallet, and the passes are claimed in ONE request.
// The day must be stamped on the first passport call, because each completion is dated by the receipt
// the server signed when it graded the visitor's answer. Also: what a receipt cannot be used for, and
// how a day held for its speed is released.
//
//   node scripts/hackathon/guest-claim-e2e.mjs
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN.
// Mints one certification on devnet (fee paid by Itera). Leaves throwaway wallet learners behind, tagged as test accounts.
import { authoredLesson, correctSubmission, firstLessonOf } from './day-solver.lib.mjs';
import { FUNCTIONS, anonKey, check, newLearner, psql, sleep, summary, tagOwnLearners } from './social-e2e.lib.mjs';

const VISITOR_PACE_MS = 1_900;
const FLOOR_MS = 20_000;

const completions = (userId, lesson) =>
  JSON.parse(
    psql(
      `select json_build_object('n', count(*), 'span_ms', coalesce(extract(epoch from max(p.completed_at) - min(p.completed_at)) * 1000, 0)::bigint)
       from itera.progress p join itera.activities a on a.id = p.activity_id
       where p.user_id = :'u'::uuid and a.lesson_id = :'l'::uuid and p.status = 'completed';`,
      { u: userId, l: lesson },
    ),
  );
const attempts = (userId) => Number(psql(`select count(*) from itera.graded_attempts where user_id = :'u'::uuid;`, { u: userId }));
const item = (activity, extra = {}) => {
  const { answer, response, trace = null } = correctSubmission(activity);
  return { activity_id: activity.id, answer, response, trace, ...extra };
};

async function main() {
  const apikey = await anonKey();
  const lesson = firstLessonOf();
  const activities = authoredLesson(lesson);
  check('day 1 has activities', activities.length >= 10, `${activities.length}`);

  // 1. The visitor: every activity graded with no session. The browser sends only what there is to grade.
  const guestHeaders = { apikey, Authorization: `Bearer ${apikey}`, 'Content-Type': 'application/json' };
  const written = Number(psql(`select count(*) from itera.graded_attempts;`));
  const played = [];
  for (const activity of activities) {
    const settledAt = Date.now();
    const answer = await fetch(`${FUNCTIONS}/grade`, { method: 'POST', headers: guestHeaders, body: JSON.stringify({ ...item(activity), passed: true, results: 'server' }) });
    const text = await answer.text();
    const body = text ? JSON.parse(text) : { error: `empty answer, HTTP ${answer.status}` };
    if (body.verdict !== 'pass') check(`visitor: ${activity.kind} ${activity.id} graded as pass`, false, JSON.stringify(body).slice(0, 140));
    played.push({ activity, settledAt, receipt: body.mode === 'participation' ? null : (body.receipt ?? null), mode: body.mode });
    await sleep(VISITOR_PACE_MS);
  }
  const signed = played.filter((entry) => entry.receipt);
  check('a visitor pass comes back with a signed receipt', signed.length >= 8 && signed.every((entry) => typeof entry.receipt.sig === 'string' && entry.receipt.sig.length === 64), `${signed.length} receipts of ${played.length}`);
  check('nothing is written for a visitor', Number(psql(`select count(*) from itera.graded_attempts;`)) >= written);

  // 2. Sign in, claim everything in one request, ask for the stamp.
  const learner = await newLearner(apikey, 'visitor');
  // The app's own background read of the companion must not put an NFT in the wallet before the certification.
  const early = await learner.call('companion', { lang: 'en', mint: 'after_credential' });
  check('before any stamp the app\'s companion read mints nothing', early.status === 200 && early.body.companion?.mint_status === 'unclaimed' && early.body.companion?.asset_address === null && early.body.lives?.current > 0, `${early.body.companion?.mint_status} · lives ${early.body.lives?.current}`);
  const startedAt = Date.now();
  const claim = await learner.call('grade', { claim: played.map((entry) => item(entry.activity, { receipt: entry.receipt, settled_at: entry.settledAt })) });
  const claimMs = Date.now() - startedAt;
  const landed = (claim.body.claimed ?? []).filter((row) => row.landed).length;
  check('one request records every pass', claim.status === 200 && landed === activities.length, `HTTP ${claim.status} · ${landed}/${activities.length} in ${claimMs} ms`);
  check('the claim takes under 5 s', claimMs < 5_000, `${claimMs} ms`);
  const day = completions(learner.userId, lesson);
  check('the completions keep the visitor\'s real times', day.n === activities.length && day.span_ms >= FLOOR_MS, `${day.n} completions over ${(day.span_ms / 1000).toFixed(1)} s`);
  const stamped = await learner.call('passport', { lang: 'en', lesson_id: lesson, max_jobs: 1 });
  const keys = (stamped.body.awards ?? []).map((award) => award.key).sort();
  check('the day is stamped on the first passport call', stamped.status === 200 && keys.includes('day_stamp') && !('day_pending_review' in stamped.body), `${keys.join(',')} ${JSON.stringify(stamped.body.day_pending_review ?? null)}`);
  check('and the mint was attempted for the wallet', stamped.body.mint?.attempted >= 1 && stamped.body.mint?.wallet === learner.address, JSON.stringify(stamped.body.mint));
  const minted = [...(stamped.body.awards ?? []), ...(stamped.body.updated ?? [])].find((award) => award.asset_address || award.mint?.address || award.state?.asset);
  const certified = psql(`select count(*) from itera.user_achievements where user_id = :'u'::uuid and achievement_key = 'trail_pass' and mint_status = 'minted';`, { u: learner.userId });
  const late = await learner.call('companion', { lang: 'en', mint: 'after_credential' });
  // Focus build (the server's default): the certification is the only thing a finished day writes to the wallet.
  if (process.env.ITERA_FOCUS_BUILD === 'off') check('once the certification is on chain the same read starts the companion', certified === '1' && ['pending', 'minted'].includes(late.body.companion?.mint_status), `certifications minted ${certified} · companion ${late.body.companion?.mint_status}`);
  else {
    check('with the certification on chain the app\'s companion read still mints nothing', certified === '1' && late.body.companion?.mint_status === 'unclaimed' && late.body.companion?.asset_address === null, `certifications minted ${certified} · companion ${late.body.companion?.mint_status}`);
    const medals = psql(`select count(*) from itera.user_achievements where user_id = :'u'::uuid and achievement_key <> 'trail_pass' and achievement_key <> 'day_stamp' and mint_status = 'minted';`, { u: learner.userId });
    const again = await learner.call('passport', { lang: 'en' });
    check('and no medal is minted next to it: nothing is left to mint', medals === '0' && again.body.remaining === 0 && !(again.body.mint?.attempted > 0), `medals minted ${medals} · remaining ${again.body.remaining} · attempted ${again.body.mint?.attempted ?? 0}`);
  }
  console.log(`stamp: ${JSON.stringify(minted ?? stamped.body.awards?.[0] ?? null).slice(0, 300)}`);

  // 3. A claim with no receipts is a burst like any other: recorded, held, and the answer says how it is released.
  const burst = await newLearner(apikey, 'burst-claim');
  const burstAt = Date.now();
  const bare = await burst.call('grade', { claim: activities.map((activity) => item(activity, { settled_at: Date.now() - 3_600_000 })) });
  check('a claim with no receipts is recorded', bare.status === 200 && bare.body.claimed.every((row) => row.landed), `HTTP ${bare.status}`);
  check('but its times are the server\'s own: one burst', completions(burst.userId, lesson).span_ms < FLOOR_MS, `${completions(burst.userId, lesson).span_ms} ms`);
  const held = await burst.call('passport', { lang: 'en', lesson_id: lesson, max_jobs: 1 });
  const review = held.body.day_pending_review;
  check('the day is held and the answer says why and what releases it', held.body.awards?.length === 0 && review?.reason === 'too_fast' && review?.min_seconds === 20 && review?.clears_by === 'redo_one_activity', JSON.stringify(review ?? null));

  // 4. Receipts that are not the server's, not this activity's, or from the future prove nothing.
  const forger = await newLearner(apikey, 'forged-receipt');
  const good = signed[0].receipt;
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const forged = await forger.call('grade', {
    claim: activities.map((activity, index) =>
      item(activity, { receipt: index === 0 ? { graded_at: hourAgo, sig: good.sig } : index === 1 ? good : { graded_at: new Date(Date.now() + 60_000).toISOString(), sig: 'f'.repeat(64) }, settled_at: Date.now() - 3_600_000 }),
    ),
  });
  const forgedDay = completions(forger.userId, lesson);
  const expectHeld = await forger.call('passport', { lang: 'en', lesson_id: lesson, max_jobs: 1 });
  check('forged, borrowed and future receipts do not stretch the day', forged.status === 200 && forgedDay.span_ms < FLOOR_MS && expectHeld.body.day_pending_review?.reason === 'too_fast', `${forgedDay.span_ms} ms ${JSON.stringify(expectHeld.body.day_pending_review ?? null)}`);

  // 5. A claim records passes only, of the visitor lesson only, for a session only.
  const liar = await newLearner(apikey, 'claim-liar');
  const choice = activities.find((activity) => activity.kind === 'single_choice');
  const wrongId = choice.spec.options.find((option) => option.id !== choice.spec.correct_option_id).id;
  const lie = await liar.call('grade', { claim: [{ activity_id: choice.id, answer: { option_ids: [wrongId] }, response: null, trace: null, receipt: signed.find((entry) => entry.activity.id === choice.id)?.receipt ?? null }] });
  check('a wrong answer in a claim lands nothing, receipt or not', lie.status === 200 && lie.body.claimed[0].landed === false && attempts(liar.userId) === 0, JSON.stringify(lie.body));
  const other = psql(`select a.id from itera.activities a where a.lesson_id <> :'l'::uuid and a.status = 'published' and a.kind = 'single_choice' limit 1;`, { l: lesson });
  const outside = await liar.call('grade', { claim: [{ activity_id: other, answer: null, response: null, trace: null }] });
  check('an activity outside the visitor lesson cannot be claimed', outside.status === 200 && outside.body.claimed[0].landed === false && attempts(liar.userId) === 0, JSON.stringify(outside.body));
  const anonymous = await fetch(`${FUNCTIONS}/grade`, { method: 'POST', headers: guestHeaders, body: JSON.stringify({ claim: [item(activities[0])] }) });
  check('a claim needs a session', anonymous.status === 401, `HTTP ${anonymous.status}`);
  const twice = await liar.call('grade', { claim: [item(activities[0]), item(activities[0])] });
  check('the same activity twice in one claim is refused', twice.status === 400, `HTTP ${twice.status}`);

  // 6. The hold is not for good: one exercise passed again after the floor releases the day.
  await sleep(Math.max(0, FLOOR_MS + 3_000 - (Date.now() - burstAt)));
  const redo = activities.find((activity) => activity.kind === 'single_choice');
  const again = await burst.call('grade', { ...item(redo), passed: true, results: 'server' });
  const released = await burst.call('passport', { lang: 'en', lesson_id: lesson, max_jobs: 1 });
  const releasedKeys = (released.body.awards ?? []).map((award) => award.key);
  check('one exercise passed again later releases the held day', again.body.verdict === 'pass' && releasedKeys.includes('day_stamp') && !('day_pending_review' in released.body), `${releasedKeys.join(',')} ${JSON.stringify(released.body.day_pending_review ?? null)}`);

  console.log(`tagged ${tagOwnLearners('guest-claim-e2e: throwaway wallet learner')} test accounts`);
  const { total, failed } = summary();
  console.log(`\n${total - failed.length} / ${total} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
