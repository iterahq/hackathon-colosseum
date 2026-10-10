// Feature 3: a teacher endorses a learner's certification (`endorse`), written on the asset.
import { FUNCTIONS, cast, check, psql, publicGet, until } from './social-e2e.lib.mjs';

const PROGRAM_SLUG = 'itera-v2';

/** Completes the n-th day (0-based) of the first trail for a learner, as the app's progress rows would. */
function completeDay(userId, index) {
  const lesson = psql(
    `select l.id from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
     where p.slug = :'program' and exists (select 1 from itera.activities a where a.lesson_id = l.id and a.status = 'published')
     order by u.ordinal, l.ordinal, l.id limit 1 offset :index;`,
    { program: PROGRAM_SLUG, index },
  );
  psql(
    `insert into itera.progress (user_id, activity_id, status, completed_at)
     select :'user_id'::uuid, a.id, 'completed', now() from itera.activities a where a.status = 'published' and a.lesson_id = :'lesson'::uuid
     on conflict (user_id, activity_id) do update set status = 'completed', completed_at = excluded.completed_at;`,
    { user_id: userId, lesson },
  );
}

async function passportUntilSettled(learner) {
  let last = await learner.call('passport', { lang: 'en' });
  for (let round = 0; round < 4 && last.status === 200 && last.body.remaining > 0; round += 1) last = await learner.call('passport', { lang: 'en' });
  return last;
}

/** A certification row that exists but was never minted (no chain cost): for the refusals that come before the chain. */
function bareCertification(userId) {
  return psql(
    `insert into itera.user_achievements (user_id, achievement_key, ref_id, state)
     select :'user_id'::uuid, 'trail_pass', u.id, jsonb_build_object('trail_title', u.title_i18n, 'days_done', 1, 'total_days', 5, 'tier', 'bronze', 'program_slug', :'program')
     from itera.programs p join itera.units u on u.program_id = p.id where p.slug = :'program' order by u.ordinal limit 1 returning id;`,
    { user_id: userId, program: PROGRAM_SLUG },
  ).split('\n')[0];
}

const rowsFor = (id) => psql(`select count(*) from itera.endorsements where user_achievement_id = :'id'::uuid;`, { id });
const attributesOf = (body) => Object.fromEntries((body.attributes ?? []).map(({ key, value }) => [key, value]));

export async function endorse(context) {
  const { instructor, learners, outsider, tenantId } = await cast(context);
  const [first, second, third] = learners;

  completeDay(first.userId, 0);
  const stamped = await passportUntilSettled(first);
  const pass = [...(stamped.body.awards ?? []), ...(stamped.body.updated ?? [])].find((award) => award.key === 'trail_pass');
  check('setup: learner 1 has a minted certification', pass?.mint_status === 'minted' && pass.asset_address, JSON.stringify(stamped.body.mint));
  const certification = pass.id;
  const asset = pass.asset_address;
  const NOTE = 'Shipped a clean semantic page <b>&</b> explained it to the class.';

  const noToken = await fetch(`${FUNCTIONS}/endorse`, { method: 'POST', headers: { apikey: context.apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ user_achievement_id: certification }) });
  check('endorse without a session token: 401', noToken.status === 401, noToken.status);
  const byPeer = await second.call('endorse', { user_achievement_id: certification });
  check('NEGATIVE a learner endorses a classmate: 403 forbidden', byPeer.status === 403 && byPeer.body.error === 'forbidden', JSON.stringify(byPeer.body));
  const byOwner = await first.call('endorse', { user_achievement_id: certification, role: 'owner', is_instructor: true });
  check('NEGATIVE the learner endorses their own certification, claiming a role in the body: 403', byOwner.status === 403, JSON.stringify(byOwner.body));
  const byOutsider = await outsider.call('endorse', { user_achievement_id: certification });
  check('NEGATIVE an instructor of ANOTHER tenant: 403 forbidden', byOutsider.status === 403 && byOutsider.body.error === 'forbidden', JSON.stringify(byOutsider.body));
  const ownCertification = bareCertification(instructor.userId);
  const self = await instructor.call('endorse', { user_achievement_id: ownCertification });
  check('NEGATIVE an instructor endorses their OWN certification: 403 self_endorsement', self.status === 403 && self.body.error === 'self_endorsement', JSON.stringify(self.body));
  const listByLearner = await second.call('endorse', { action: 'list' });
  check('NEGATIVE a learner asks for the students\' certifications: 403', listByLearner.status === 403);
  check('no refused call wrote anything', rowsFor(certification) === '0' && rowsFor(ownCertification) === '0');

  const malformed = await instructor.call('endorse', { user_achievement_id: 'nope' });
  check('endorse with a malformed id: 400', malformed.status === 400 && malformed.body.error === 'invalid_body');
  const longNote = await instructor.call('endorse', { user_achievement_id: certification, note: 'x'.repeat(141) });
  check('a note over 140 characters: 400 invalid_note', longNote.status === 400 && longNote.body.error === 'invalid_note');
  const unknown = await instructor.call('endorse', { user_achievement_id: '00000000-0000-4000-8000-00000000dead' });
  check('an unknown certification: 404', unknown.status === 404 && unknown.body.error === 'certification_not_found');
  const unminted = await instructor.call('endorse', { user_achievement_id: bareCertification(third.userId) });
  check('a certification that is not on chain yet: 409 not_minted', unminted.status === 409 && unminted.body.error === 'not_minted', JSON.stringify(unminted.body));

  const done = await instructor.call('endorse', { user_achievement_id: certification, note: NOTE, lang: 'en' });
  check('instructor endorses: 200 with the FULL instructor wallet and a transaction', done.status === 200 && done.body.status === 'endorsed' && done.body.already_endorsed === false && done.body.endorsement?.wallet === instructor.address && done.body.endorsement.slot === 1 && typeof done.body.endorsement.tx_signature === 'string', JSON.stringify(done.body).slice(0, 220));
  check('database: one endorsement row with the note, wallet and signature', psql(`select wallet || '|' || note || '|' || (tx_signature is not null) || '|' || slot from itera.endorsements where user_achievement_id = :'id'::uuid;`, { id: certification }) === `${instructor.address}|${NOTE}|true|1`);

  const verify = await until(() => publicGet(`credential-verify/${asset}?lang=en&t=${Date.now()}`), (answer) => attributesOf(answer.body).endorsed_by_1 !== undefined, 12, 1500);
  const attributes = attributesOf(verify.body);
  check('on chain: endorsed_by_1 is the full address (not shortened) and endorsed_at_1 is set', attributes.endorsed_by_1 === instructor.address && attributes.endorsed_by_1.length >= 32 && !Number.isNaN(Date.parse(attributes.endorsed_at_1)), JSON.stringify({ by: attributes.endorsed_by_1, at: attributes.endorsed_at_1 }));
  check('on chain: the certification keeps its own attributes and stays verified and soulbound', verify.body.verified === true && verify.body.frozen === true && attributes.kind === 'trail_passport' && attributes.days_done === '1');
  const listed = verify.body.endorsements ?? [];
  check('credential-verify: endorsements [{ wallet, at, tx_signature, explorer_url }]', listed.length === 1 && listed[0].wallet === instructor.address && listed[0].tx_signature === done.body.endorsement.tx_signature && /explorer\.solana\.com\/tx\//.test(listed[0].explorer_url) && Object.keys(listed[0]).sort().join() === 'at,explorer_url,tx_signature,wallet', JSON.stringify(listed).slice(0, 200));
  const publicText = JSON.stringify(verify.body);
  check('nothing public carries the note, a name or the instructor\'s internal id', !publicText.includes('Shipped a clean') && !publicText.includes(instructor.userId));
  const art = await (await fetch(done.body.image_url)).text();
  check('art: the seal is drawn; no note and no wallet in it', art.includes('data-endorsed="1"') && !art.includes('Shipped') && !art.includes(instructor.address));
  const transaction = await until(() => fetch('https://api.devnet.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[done.body.endorsement.tx_signature], { searchTransactionHistory: true }] }) }).then((answer) => answer.json()), (answer) => answer.result?.value?.[0], 8, 1500);
  check('the endorsement transaction is confirmed on devnet with no error', transaction.result?.value?.[0] && transaction.result.value[0].err === null);

  const again = await instructor.call('endorse', { user_achievement_id: certification, note: 'another note' });
  check('endorsing again: 200 already_endorsed, same transaction, still one row and the first note', again.status === 200 && again.body.already_endorsed === true && again.body.endorsement.tx_signature === done.body.endorsement.tx_signature && rowsFor(certification) === '1' && psql(`select note from itera.endorsements where user_achievement_id = :'id'::uuid;`, { id: certification }) === NOTE);

  // A later stamp rewrites the asset's attributes: the endorsement must survive it.
  completeDay(first.userId, 1);
  const secondDay = await passportUntilSettled(first);
  const afterStamp = await until(() => publicGet(`credential-verify/${asset}?lang=en&t=${Date.now()}`), (answer) => attributesOf(answer.body).days_done === '2', 12, 1500);
  check('a later stamp keeps the endorsement on chain (days_done 2 + endorsed_by_1)', attributesOf(afterStamp.body).days_done === '2' && attributesOf(afterStamp.body).endorsed_by_1 === instructor.address, JSON.stringify(secondDay.body.mint));

  // A second teacher, then the cap of three.
  psql(`insert into itera.memberships (user_id, tenant_id, role) values (:'user_id'::uuid, :'tenant'::uuid, 'instructor');`, { user_id: outsider.userId, tenant: tenantId });
  const secondTeacher = await outsider.call('endorse', { user_achievement_id: certification });
  check('once made an instructor of the learner\'s tenant, the same person can endorse: slot 2', secondTeacher.status === 200 && secondTeacher.body.endorsement?.slot === 2 && secondTeacher.body.endorsements.length === 2, JSON.stringify(secondTeacher.body).slice(0, 160));
  psql(`insert into itera.endorsements (user_achievement_id, instructor_user_id, wallet, slot, tx_signature) values (:'id'::uuid, :'user_id'::uuid, :'wallet', 3, 'social-e2e-simulated');`, { id: certification, user_id: third.userId, wallet: third.address });
  psql(`update itera.memberships set role = 'instructor' where user_id = :'user_id'::uuid and tenant_id = :'tenant'::uuid;`, { user_id: second.userId, tenant: tenantId });
  const fourth = await second.call('endorse', { user_achievement_id: certification });
  check('a fourth endorsement: 409 endorsements_full (three per certification)', fourth.status === 409 && fourth.body.error === 'endorsements_full' && rowsFor(certification) === '3', JSON.stringify(fourth.body));
  psql(`update itera.memberships set role = 'learner' where user_id = :'user_id'::uuid and tenant_id = :'tenant'::uuid;`, { user_id: second.userId, tenant: tenantId });
  psql(`delete from itera.endorsements where tx_signature = 'social-e2e-simulated';`);

  const profile = await publicGet(`learner-profile/${first.address}?lang=en&t=${Date.now()}`);
  const shown = (profile.body.certifications ?? []).find((entry) => entry.asset === asset);
  check('learner-profile: the certification counts its endorsements and its art URL changes with them', shown?.endorsements === 2 && /-e2/.test(shown.image_url), JSON.stringify(shown ?? null).slice(0, 200));

  const list = await instructor.call('endorse', { action: 'list', lang: 'en' });
  const mine = (list.body.certifications ?? []).find((entry) => entry.user_achievement_id === certification);
  check('instructor list: the students\' minted certifications, with what the caller already endorsed', list.status === 200 && mine?.endorsed_by_me === true && mine.endorsements === 2 && mine.asset_address === asset && !(list.body.certifications ?? []).some((entry) => entry.user_achievement_id === ownCertification), JSON.stringify(mine ?? null).slice(0, 200));
  const clientRead = JSON.stringify(await first.rest('endorsements?select=*'));
  check('no client reads the endorsements table (functions only)', clientRead.includes('permission denied') || clientRead === '[]', clientRead.slice(0, 80));
  context.endorsed = { asset, certification, instructor, learner: first };
}
