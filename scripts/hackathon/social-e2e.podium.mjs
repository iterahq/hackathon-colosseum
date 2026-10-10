// Feature 2: live-class podium medals (`class-podium`) and the weekly-goal medal.
import { FUNCTIONS, cast, check, psql, publicGet, until } from './social-e2e.lib.mjs';

/** A user row with no sign-in at all: plays the link visitor (guest) and the learner without a wallet. */
export function bareUser(label) {
  return psql(`insert into itera.users (email, display_name) values (:'email', :'name') returning id;`, { email: `social-e2e-${label}-${Date.now().toString(36)}@example.invalid`, name: `e2e ${label}` }).split('\n')[0];
}

/** An ended class session with the minimum rows the report ranking reads. `scores`: [userId, correct, wrong, elapsedMs]. */
export function buildSession({ tenantId, instructorId, scores, status = 'ended' }) {
  const lesson = psql(
    `select l.id from itera.lessons l where (select count(*) from itera.activities a where a.lesson_id = l.id and a.status = 'published') >= 3 order by l.id limit 1;`,
  );
  const activities = psql(`select id from itera.activities where lesson_id = :'lesson'::uuid and status = 'published' order by id limit 3;`, { lesson }).split('\n');
  const session = psql(
    `insert into itera.class_sessions (tenant_id, lesson_id, instructor_id, status, scope, started_at, ended_at)
     values (:'tenant'::uuid, :'lesson'::uuid, :'instructor'::uuid, :'status', 'tenant', now() - interval '40 minutes', now() - interval '5 minutes') returning id;`,
    { tenant: tenantId, lesson, instructor: instructorId, status },
  ).split('\n')[0];
  for (const [userId, correct, wrong, elapsed] of scores) {
    psql(`insert into itera.class_attendance (session_id, user_id) values (:'session'::uuid, :'user_id'::uuid);`, { session, user_id: userId });
    for (let index = 0; index < correct + wrong; index += 1) {
      psql(`insert into itera.class_answers (session_id, activity_id, user_id, correct, elapsed_ms) values (:'session'::uuid, :'activity'::uuid, :'user_id'::uuid, :correct, :elapsed);`, {
        session, activity: activities[index], user_id: userId, correct: index < correct ? 'true' : 'false', elapsed,
      });
    }
  }
  return { session, lesson, activities };
}

const medalRows = (session) => psql(`select count(*) from itera.user_achievements where ref_id = :'session'::uuid;`, { session });

export async function podium(context) {
  const { instructor, learners, outsider, tenantId, freeAccount, personalTenantId } = await cast(context);
  const [first, second, , fourth] = learners;
  const guest = bareUser('guest');
  const walletless = bareUser('no-wallet');
  psql(`insert into itera.memberships (user_id, tenant_id, role) values (:'user_id'::uuid, :'tenant'::uuid, 'learner');`, { user_id: walletless, tenant: tenantId });

  // Report order: guest (3, fastest) · instructor (3) · learner 1 (3) · learner 2 (2) · no-wallet (1, fast) · learner 4 (1, slow) · learner 3 (attended only, added below).
  const { session, activities } = buildSession({
    tenantId,
    instructorId: instructor.userId,
    status: 'live',
    scores: [[guest, 3, 0, 500], [instructor.userId, 3, 0, 700], [first.userId, 3, 0, 900], [second.userId, 2, 1, 900], [walletless, 1, 2, 800], [fourth.userId, 1, 2, 2000]],
  });
  psql(`insert into itera.class_guests (session_id, user_id, display_name) values (:'session'::uuid, :'user_id'::uuid, 'Visitor');`, { session, user_id: guest });
  psql(`insert into itera.class_attendance (session_id, user_id) values (:'session'::uuid, :'user_id'::uuid);`, { session, user_id: learners[2].userId });
  context.podiumSession = session;

  const noToken = await fetch(`${FUNCTIONS}/class-podium`, { method: 'POST', headers: { apikey: context.apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session }) });
  check('class-podium without a session token: 401', noToken.status === 401, noToken.status);
  const byLearner = await fourth.call('class-podium', { session_id: session });
  check('NEGATIVE a learner of the class calls class-podium: 403 forbidden', byLearner.status === 403 && byLearner.body.error === 'forbidden', JSON.stringify(byLearner.body));
  const byOutsider = await outsider.call('class-podium', { session_id: session });
  check('NEGATIVE an instructor of ANOTHER tenant: 403 forbidden', byOutsider.status === 403 && byOutsider.body.error === 'forbidden', JSON.stringify(byOutsider.body));
  const forged = await fourth.call('class-podium', { session_id: session, role: 'instructor', tenant_id: tenantId, is_instructor: true });
  check('NEGATIVE a role claimed in the body is ignored: 403', forged.status === 403);
  // A free account owns its personal tenant and could stage a "class" there with its own accounts.
  const staged = buildSession({ tenantId: personalTenantId, instructorId: freeAccount.userId, scores: [[first.userId, 3, 0, 900], [second.userId, 2, 1, 900]] });
  const byFreeAccount = await freeAccount.call('class-podium', { session_id: staged.session });
  check('NEGATIVE the owner of a PERSONAL tenant records a class staged there: 403, nothing minted', byFreeAccount.status === 403 && byFreeAccount.body.error === 'forbidden' && medalRows(staged.session) === '0', JSON.stringify(byFreeAccount.body));
  const malformed = await instructor.call('class-podium', { session_id: 'nope' });
  check('class-podium with a malformed session id: 400', malformed.status === 400 && malformed.body.error === 'invalid_body');
  const unknown = await instructor.call('class-podium', { session_id: '00000000-0000-4000-8000-00000000dead' });
  check('class-podium for an unknown session: 404', unknown.status === 404 && unknown.body.error === 'session_not_found');
  const live = await instructor.call('class-podium', { session_id: session });
  check('class-podium while the class is still live: 409 session_not_ended', live.status === 409 && live.body.error === 'session_not_ended', JSON.stringify(live.body));
  check('nothing was recorded by any refused call', medalRows(session) === '0' && psql(`select count(*) from itera.class_podiums where session_id = :'session'::uuid;`, { session }) === '0');

  psql(`update itera.class_sessions set status = 'ended' where id = :'session'::uuid;`, { session });
  const recorded = await instructor.call('class-podium', { session_id: session, lang: 'en' });
  const places = recorded.body.places ?? [];
  check('instructor records the podium: 200, three places', recorded.status === 200 && places.length === 3 && recorded.body.already_recorded === false, JSON.stringify(recorded.body).slice(0, 200));
  check('places follow the report rule; guest and instructor are skipped without leaving a hole', places.map((place) => place.user_id).join() === [first.userId, second.userId, walletless].join(), places.map((place) => `${place.position}:${place.user_id.slice(0, 8)}`).join(' '));
  check('keys and titles: podium_1/2/3', places.map((place) => place.key).join() === 'podium_1,podium_2,podium_3' && places[0].title === '1st place in a live class');
  check('1st and 2nd (wallet learners) are minted with explorer links', places[0].mint_status === 'minted' && places[1].mint_status === 'minted' && /explorer\.solana\.com\/address\//.test(places[0].explorer_url ?? ''), places.map((place) => place.mint_status).join());
  check('3rd (no wallet) stays unclaimed, as usual', places[2].mint_status === 'unclaimed' && places[2].asset_address === null);
  check('the wallets in the answer are the learners\' own', places[0].wallet === first.address && places[1].wallet === second.address);

  const state = JSON.parse(psql(`select state from itera.user_achievements where ref_id = :'session'::uuid and achievement_key = 'podium_1';`, { session }));
  check('medal row: ref_id = session, state holds position, class title and date', state.position === 1 && typeof state.class_title === 'object' && /^\d{4}-\d\d-\d\d$/.test(state.class_date), JSON.stringify(state).slice(0, 160));
  check('exactly three medal rows and one podium row for the session', medalRows(session) === '3' && psql(`select count(*) from itera.class_podiums where session_id = :'session'::uuid;`, { session }) === '1');

  const verify = await until(() => publicGet(`credential-verify/${places[0].asset_address}?lang=en&t=${Date.now()}`), (answer) => answer.status === 200, 10, 1500);
  const attributes = Object.fromEntries((verify.body.attributes ?? []).map(({ key, value }) => [key, value]));
  check('on chain: verified, soulbound, owned by the learner', verify.body.verified === true && verify.body.frozen === true && verify.body.owner === first.address, JSON.stringify(verify.body.checks));
  check('on chain: achievement podium_1, position 1, class date; no internal learner id', attributes.achievement === 'podium_1' && attributes.position === '1' && attributes.class_date === state.class_date && attributes.tier === 'gold' && !('learner' in attributes) && !JSON.stringify(verify.body.attributes).includes(first.userId), JSON.stringify(attributes));
  const art = await (await fetch(`${FUNCTIONS}/credential-meta/${verify.body.achievement?.credential_id}/image.svg?lang=en`)).text();
  check('credential-verify describes the medal: key, place, class', verify.body.achievement?.key === 'podium_1' && verify.body.achievement.state?.position === 1 && verify.body.achievement.state.class_date === state.class_date, JSON.stringify(verify.body.achievement ?? null).slice(0, 160));
  check('art: the podium variant for the place', art.includes('data-podium="1"') && art.includes('#3FD17F'));
  const profile = await publicGet(`learner-profile/${first.address}?lang=en&t=${Date.now()}`);
  check('the medal is on the learner\'s public profile, verified', (profile.body.medals ?? []).some((medal) => medal.key === 'podium_1' && medal.verified && medal.asset === places[0].asset_address), JSON.stringify((profile.body.medals ?? []).map((medal) => medal.key)));
  const own = await first.rest(`user_achievements?select=achievement_key,mint_status&achievement_key=eq.podium_1`);
  check('the learner reads the medal row for the shelf (RLS: own rows)', Array.isArray(own) && own.length === 1 && own[0].mint_status === 'minted');
  check('nobody reads class_podiums from a client', JSON.stringify(await first.rest('class_podiums?select=*')).includes('permission denied') || JSON.stringify(await instructor.rest('class_podiums?select=*')) === '[]');

  // A better score written after the fact must not move a recorded podium.
  psql(`update itera.class_answers set correct = true, elapsed_ms = 1 where session_id = :'session'::uuid and user_id = :'user_id'::uuid;`, { session, user_id: fourth.userId });
  const again = await instructor.call('class-podium', { session_id: session, lang: 'en' });
  check('second call: idempotent (already_recorded, same assets, no new rows)', again.status === 200 && again.body.already_recorded === true && again.body.places.map((place) => place.asset_address).join() === places.map((place) => place.asset_address).join() && medalRows(session) === '3');
  check('a recorded podium is final: later answers do not change it', again.body.places.map((place) => place.user_id).join() === places.map((place) => place.user_id).join());
  check('no second mint: the medal transactions are the same', psql(`select string_agg(coalesce(tx_signature, '-'), ',' order by achievement_key) from itera.user_achievements where ref_id = :'session'::uuid;`, { session }).split(',').filter((signature) => signature !== '-').length === 2);

  const viewMine = await first.call('class-podium', { session_id: session, view: true });
  check('learner view: places with on-chain status, own place flagged, no name and no wallet', viewMine.status === 200 && viewMine.body.recorded === true && viewMine.body.places.length === 3 && viewMine.body.places[0].mine === true && viewMine.body.places[0].mint_status === 'minted' && viewMine.body.places[1].user_id === second.userId && !JSON.stringify(viewMine.body).includes(second.address) && !('name' in viewMine.body.places[0]), JSON.stringify(viewMine.body).slice(0, 200));
  const viewOutsider = await outsider.call('class-podium', { session_id: session, view: true });
  check('NEGATIVE someone outside the class and its tenant cannot view it: 403', viewOutsider.status === 403);

  // Weekly goal: 20 activities in seven days, none of them completing a day.
  psql(
    `insert into itera.progress (user_id, activity_id, status, completed_at)
     select :'user_id'::uuid, id, 'completed', now() - (n || ' minutes')::interval from (
       select a.id, row_number() over (partition by a.lesson_id order by a.id) as rank, row_number() over (order by a.lesson_id) as n,
              count(*) over (partition by a.lesson_id) as in_lesson
       from itera.activities a where a.status = 'published') ranked
     where rank = 1 and in_lesson >= 2 order by id limit 19;`,
    { user_id: fourth.userId },
  );
  const nineteen = await fourth.call('passport', { lang: 'en' });
  check('weekly goal: 19 activities award nothing', nineteen.status === 200 && nineteen.body.awards.length === 0, JSON.stringify(nineteen.body.awards?.map((award) => award.key)));
  psql(
    `insert into itera.progress (user_id, activity_id, status, completed_at)
     select :'user_id'::uuid, id, 'completed', now() from (
       select a.id, row_number() over (partition by a.lesson_id order by a.id) as rank, count(*) over (partition by a.lesson_id) as in_lesson
       from itera.activities a where a.status = 'published') ranked
     where rank = 1 and in_lesson >= 2 and id not in (select activity_id from itera.progress where user_id = :'user_id'::uuid) order by id limit 1;`,
    { user_id: fourth.userId },
  );
  const twenty = await fourth.call('passport', { lang: 'en' });
  const weekly = (twenty.body.awards ?? []).find((award) => award.key === 'weekly_goal');
  check('weekly goal: the 20th awards `weekly_goal` alone, minted', twenty.body.awards?.length === 1 && weekly?.mint_status === 'minted' && weekly.title === 'Weekly goal' && /^\d{4}-W\d\d$/.test(weekly.state?.week ?? ''), JSON.stringify(twenty.body.awards?.map((award) => `${award.key}:${award.mint_status}`)));
  check('weekly goal: ref_id is the deterministic uuid of the week', /^7765656b-\d{4}-40\d\d-8000-000000000000$/.test(weekly?.ref_id ?? ''), weekly?.ref_id);
  const replay = await fourth.call('passport', { lang: 'en' });
  check('weekly goal: once per week (a second call awards nothing)', replay.body.awards?.length === 0 && psql(`select count(*) from itera.user_achievements where user_id = :'user_id'::uuid and achievement_key = 'weekly_goal';`, { user_id: fourth.userId }) === '1');
  void activities;
}
