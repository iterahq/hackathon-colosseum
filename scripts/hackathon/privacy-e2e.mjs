#!/usr/bin/env node
// End-to-end check of the privacy rules on the hackathon project: the public profile is a choice, the
// talent board is opt-in with a contact, and a contact is shown to companies only. It is also the
// attack pass: every way this script could think of to read a contact or a private profile.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   RUN=<stamp of a tera-e2e.mjs run> node scripts/hackathon/privacy-e2e.mjs
//
// Needs three throwaway wallets of a `tera-e2e.mjs` run made BEFORE the privacy migration: `tera-e2e-s-<RUN>`
// (funded a bounty: a company), `tera-e2e-a-<RUN>` and `tera-e2e-l-<RUN>` (learners with a stamped day).
// Creates ONE new account and stamps one day for it (about 0.008 devnet SOL of the mint authority: the
// certification and the Tera of its chest). No other chain write. Every account is tagged in
// `itera.test_accounts`. It inserts ten rows in `talent_contact_reveals` to reach the daily cap without
// ten real learners, and deletes exactly those rows. It reads the owner's public profile once and writes
// nothing about it. Contacts it types are made up (`example.com`); none is printed.
import { balance, call, check, completeDays, done, get, loadAuthority, login, passport, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const RUN = process.env.RUN;
if (!RUN) throw new Error('RUN is not set: the stamp of a tera-e2e.mjs run whose wallets are in the keys folder');
const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const BASE = `https://${PROJECT_REF}.supabase.co`;
const FUNCTIONS = `${BASE}/functions/v1`;
const OWNER_WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
const AUTHORITY_FLOOR = 620_000_000;
const stamp = Date.now().toString(36);
const EMAIL = `ana.${stamp}@example.com`;
const TELEGRAM = `ana_${stamp}`;
const LINK = `https://ana-${stamp}.example.com/contact`;
const SECRETS = [EMAIL, TELEGRAM, LINK, `ana-${stamp}`];

const userIdOf = async (who) => (await sql(`select user_id from itera.identities where provider_subject = '${who.authUid}' limit 1`))[0].user_id;
const tag = (who, reason) => sql(`insert into itera.test_accounts (user_id, reason) select i.user_id, 'privacy-e2e: ${reason}' from itera.identities i where i.provider_subject = '${who.authUid}' on conflict (user_id) do nothing`);
const talent = (who, body) => call('talent-board', who, body);
const leaks = (value) => SECRETS.filter((secret) => JSON.stringify(value ?? null).includes(secret));
const anonKey = async () => {
  if (process.env.HACKATHON_ANON_KEY) return process.env.HACKATHON_ANON_KEY;
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
  return (await response.json()).find((entry) => entry.name === 'anon').api_key;
};
/** A read of a table straight through PostgREST, as the browser could try it: with the anon key, or with a learner's own session. */
const restRead = async (table, token) => {
  const apikey = await anonKey();
  const response = await fetch(`${BASE}/rest/v1/${table}?select=*&limit=5`, { headers: { apikey, Authorization: `Bearer ${token ?? apikey}`, 'Accept-Profile': 'itera' } });
  const body = await response.json().catch(() => null);
  return { status: response.status, rows: Array.isArray(body) ? body.length : null };
};
/** A public function called with somebody's session in the header. */
const getAs = async (path, who) => {
  const response = await fetch(`${FUNCTIONS}/${path}`, { headers: { apikey: await anonKey(), Authorization: `Bearer ${who.token}` } });
  return { http: response.status, j: await response.json().catch(() => null) };
};

const authority = loadAuthority();
if ((await balance(authority.address)) - 15_000_000 < AUTHORITY_FLOOR) throw new Error('the authority is at its floor: nothing was sent');
const cutoff = (await sql(`select value from itera.onchain_config where key = 'profile_private_from'`))[0]?.value;
if (!cutoff) throw new Error('onchain_config.profile_private_from is missing: apply migration 0355 first');

const company = await login(wallet(`tera-e2e-s-${RUN}`));
const veteran = await login(wallet(`tera-e2e-a-${RUN}`));
const other = await login(wallet(`tera-e2e-l-${RUN}`));
const fresh = await login(wallet(`privacy-e2e-n-${stamp}`));
await tag(fresh, 'new account');
const freshId = await userIdOf(fresh);
const otherId = await userIdOf(other);
const companyId = await userIdOf(company);
console.log(`cutoff ${cutoff}\nnew account ${fresh.address}\nolder learners ${veteran.address} ${other.address}\ncompany ${company.address}`);
await completeDays(fresh.authUid, 1, 1);
const stamped = await passport(fresh);
const certification = [...(stamped.j?.awards ?? []), ...(stamped.j?.updated ?? [])].find((entry) => entry.key === 'trail_pass')?.asset_address;
check('the new account holds a certification with one stamped day (so there is a profile to hide)', Boolean(certification));

// ---- 1. The public profile is a choice ---------------------------------------------------------------
check('`privacy` without a session is refused', (await call('privacy', null, null, 'GET')).http === 401);
const mine = (await call('privacy', fresh, null, 'GET')).j;
check('an account created after the cutoff is private until it chooses', mine?.public_profile === false && mine.public_profile_source === 'new_account' && mine.talent.listed === false && mine.talent.contact === null, JSON.stringify(mine).slice(0, 200));
const old = (await call('privacy', veteran, null, 'GET')).j;
check('an account that existed before the cutoff stays visible: nobody asked to hide it', old?.public_profile === true && old.public_profile_source === 'existing_account');

const stranger = (await get(`learner-profile/${fresh.address}?fresh=1`)).j;
check('a stranger asking for a private wallet gets the address, the cluster and one flag: nothing else', JSON.stringify(Object.keys(stranger ?? {}).sort()) === JSON.stringify(['cluster', 'private', 'wallet']) && stranger.private === true, JSON.stringify(stranger));
const signedStranger = (await getAs(`learner-profile/${fresh.address}?fresh=1`, other)).j;
check('another signed-in learner gets the same nothing', JSON.stringify(Object.keys(signedStranger ?? {}).sort()) === JSON.stringify(['cluster', 'private', 'wallet']));
const asCompany = (await getAs(`learner-profile/${fresh.address}?fresh=1`, company)).j;
check('and so does a company: a contact reveal is the only thing a company gets that others do not', asCompany?.private === true && !('certifications' in asCompany));
const junkToken = await fetch(`${FUNCTIONS}/learner-profile/${fresh.address}`, { headers: { apikey: await anonKey(), Authorization: 'Bearer not.a.token' } }).then((response) => response.json());
check('a made-up token is a stranger, not an owner', junkToken?.private === true && !('certifications' in junkToken));
const owner = (await getAs(`learner-profile/${fresh.address}?fresh=1`, fresh)).j;
check('the owner, signed in, sees the whole page and is told it is private', owner?.private === true && owner.viewer === 'owner' && owner.certifications?.length === 1 && owner.wallet === fresh.address);
const graph = (await get(`capability-graph/${fresh.address}`)).j;
check('capability-graph answers a private wallet with nothing of the graph', graph?.private === true && !('capabilities' in graph));
const earned = (await get(`bounty-board/wallet/${fresh.address}`)).j;
check('bounty-board/wallet answers a private wallet with no earnings', earned?.private === true && !('items' in earned) && !('earned_lamports' in earned));
const preview = await fetch(`${FUNCTIONS}/share-meta/u/${fresh.address}`, { headers: { apikey: await anonKey() } }).then((response) => response.text());
check('the link preview of a private profile is the site\'s own, with nothing counted about the wallet', preview.includes('Proof of learning that lives in your wallet') && !preview.includes('capability graph'));
const board0 = (await get('talent-board')).j;
check('a private wallet is not on the talent board', !(board0?.learners ?? []).some((card) => card.wallet === fresh.address));
const proof = (await get(`credential-verify/${certification}?fresh=1`)).j;
check('its certification page stays public: it is the proof and it reads the chain', proof?.verified === true && proof.owner === fresh.address);
const ownerProfile = (await get(`learner-profile/${OWNER_WALLET}`)).j;
check('READ ONLY: the recording account renders as before (visible, its certification listed)', ownerProfile?.private === false && ownerProfile.viewer === 'public' && ownerProfile.certifications?.length >= 1 && ownerProfile.verified_count >= 1);

// ---- 2. Listing needs the public page and a contact ---------------------------------------------------
const contact = { email: EMAIL, telegram: `@${TELEGRAM}`, link: LINK };
check('listing while the profile is private is refused: the page is switched on by its owner, not by listing', (await talent(fresh, { action: 'list', headline: 'Builds semantic pages', contact })).j?.error === 'profile_private');
check('a malformed privacy body is refused', (await call('privacy', fresh, { action: 'set_profile', public: 'yes' })).http === 400 && (await call('privacy', fresh, { action: 'delete_everything' })).http === 400);
const on = (await call('privacy', fresh, { action: 'set_profile', public: true })).j;
check('the owner switches the profile on', on?.public_profile === true && on.public_profile_source === 'chosen');
const shown = (await get(`learner-profile/${fresh.address}?fresh=1`)).j;
check('now a stranger sees the page', shown?.private === false && shown.viewer === 'public' && shown.certifications?.length === 1);
check('listing without a contact is refused', (await talent(fresh, { action: 'list', headline: 'Builds semantic pages' })).j?.error === 'contact_required' && (await talent(fresh, { action: 'list', contact: {} })).j?.error === 'contact_required');
for (const [label, bad, field] of [
  ['markup in the e-mail', { email: '<script>alert(1)</script>@example.com' }, 'email'],
  ['an attribute break in the e-mail', { email: 'ana@example.com"><img src=x onerror=alert(1)>' }, 'email'],
  ['a header injection in the e-mail', { email: 'ana@example.com\nbcc:x@example.com' }, 'email'],
  ['a javascript: link', { link: 'javascript:alert(1)' }, 'link'],
  ['a link with markup', { link: 'https://example.com/<svg onload=alert(1)>' }, 'link'],
  ['an http link', { link: 'http://example.com' }, 'link'],
  ['a LinkedIn look-alike host', { linkedin: 'https://www.linkedin.com.evil.example/in/ana' }, 'linkedin'],
  ['a Telegram handle with markup', { telegram: 'ana<b>dev' }, 'telegram'],
  ['a good e-mail beside a bad link', { email: EMAIL, link: 'javascript:alert(1)' }, 'link'],
]) {
  const answer = (await talent(fresh, { action: 'list', contact: bad })).j;
  check(`a contact with ${label} is refused, naming the field`, answer?.error === 'invalid_contact' && answer.field === field, JSON.stringify(answer));
}
check('nothing was stored by those refusals', (await sql(`select (select count(*) from itera.talent_contacts where user_id = '${freshId}')::int + (select count(*) from itera.talent_listings where user_id = '${freshId}')::int as n`))[0].n === 0);
const listed = (await talent(fresh, { action: 'list', headline: 'Builds semantic pages', contact })).j;
check('with the page on and a contact, the learner is listed and reads back their own contact', listed?.listed === true && listed.contact?.email === EMAIL && listed.contact.telegram === TELEGRAM && listed.contact.link === LINK && listed.contact.linkedin === null && listed.companies_looked === 0);
await talent(other, { action: 'list', headline: 'Second listed learner', contact: { email: `bia.${stamp}@example.com` } });

// ---- 3. Nothing public carries the contact --------------------------------------------------------------
const board = (await get('talent-board')).j;
const card = (board?.learners ?? []).find((entry) => entry.wallet === fresh.address);
check('the public board shows the card with `has_contact` and nothing of the contact', card?.has_contact === true && leaks(board).length === 0 && !('contact' in card) && !('email' in card), `leaks: ${leaks(board).length}`);
const everywhere = await Promise.all([
  get(`learner-profile/${fresh.address}?fresh=1`),
  getAs(`learner-profile/${fresh.address}?fresh=1`, fresh),
  get(`capability-graph/${fresh.address}`),
  get(`credential-verify/${certification}?fresh=1`),
  get(`bounty-board/wallet/${fresh.address}`),
  get(`bounty-board/invited/${fresh.address}`),
  get(`talent-board?min_days=1`),
  talent(other, { action: 'status' }),
  talent(company, { action: 'status' }),
  call('privacy', other, null, 'GET'),
  call('privacy', company, null, 'GET'),
]);
check('no public function, and no other account\'s own answers, carry it: profile, graph, certification, earnings, inbox, board, status, privacy', everywhere.every((answer) => answer.http === 200 && leaks(answer.j).length === 0), everywhere.map((answer) => `${answer.http}:${leaks(answer.j).length}`).join(' '));
const meta = await fetch(proof.uri).then((response) => response.text());
const onchain = JSON.stringify(proof.attributes);
check('nor does the certification\'s metadata or its on-chain attributes', leaks(meta).length === 0 && leaks(onchain).length === 0);
for (const table of ['talent_contacts', 'talent_contact_reveals', 'profile_settings']) {
  const asAnon = await restRead(table);
  const asSelf = await restRead(table, fresh.token);
  check(`the table ${table} answers nothing through the API: not to the anon key, not to the learner's own session`, asAnon.status >= 400 && asSelf.status >= 400 && asAnon.rows === null && asSelf.rows === null, `anon ${asAnon.status}, own session ${asSelf.status}`);
}

// ---- 4. Who is shown a contact ---------------------------------------------------------------------------
const reveal = (who, target) => talent(who, { action: 'reveal_contact', wallet: target });
check('a visitor with no session is refused', (await reveal(null, fresh.address)).http === 401);
const byLearner = await reveal(other, fresh.address);
check('another learner is refused: not a company', byLearner.http === 403 && byLearner.j?.error === 'not_a_company' && leaks(byLearner.j).length === 0);
const bySelf = await reveal(fresh, fresh.address);
check('the learner is not a company either', bySelf.http === 403 && bySelf.j?.error === 'not_a_company');
const claimed = await talent(other, { action: 'reveal_contact', wallet: fresh.address, is_company: true, via: 'funded_bounty', company: true, role: 'tenant_admin' });
check('saying "I am a company" in the request changes nothing', claimed.http === 403 && leaks(claimed.j).length === 0);
const notCompany = (await talent(other, { action: 'company' })).j;
const isCompany = (await talent(company, { action: 'company' })).j;
check('a wallet that funded a bounty is a company; a learner is not', isCompany?.is_company === true && isCompany.via === 'funded_bounty' && isCompany.reveals_per_day === 10 && notCompany?.is_company === false && notCompany.reveals_left_today === 0);
const before = isCompany.reveals_left_today;
const shownTo = await reveal(company, fresh.address);
check('the company is shown the contact, and the reveal is counted', shownTo.http === 200 && shownTo.j?.contact?.email === EMAIL && shownTo.j.contact.telegram === TELEGRAM && shownTo.j.reveals_left_today === before - 1);
const again = await reveal(company, fresh.address);
check('looking again at the same learner does not use the allowance up', again.http === 200 && again.j?.reveals_left_today === before - 1);
const looked = (await talent(fresh, { action: 'status' })).j;
check('the learner sees that ONE company looked, not which', looked?.companies_looked === 1 && Boolean(looked.last_looked_at) && !JSON.stringify(looked).includes(company.address) && !JSON.stringify(looked).includes(companyId));
const audit = await sql(`select count(*)::int n, count(distinct via)::int vias from itera.talent_contact_reveals where company_user_id = '${companyId}' and learner_user_id = '${freshId}'`);
check('every reveal is recorded: who, whose, when (two rows for two looks)', audit[0].n === 2 && audit[0].vias === 1);
check('a wallet that is not listed has no contact to show', (await reveal(company, veteran.address)).j?.error === 'not_listed' && (await reveal(company, company.address)).j?.error === 'not_listed');
check('a malformed wallet is refused', (await reveal(company, 'x')).http === 400);

// The cap: ten different learners in 24 hours. Nine more are written straight into the audit table (existing test
// accounts stand in for learners), then a new learner is one too many. Exactly those rows are deleted afterwards.
const standIns = await sql(`select t.user_id from itera.test_accounts t where t.user_id not in ('${freshId}', '${otherId}', '${companyId}') limit 9`);
const fake = await sql(`insert into itera.talent_contact_reveals (company_user_id, learner_user_id, via) select '${companyId}', u, 'funded_bounty' from unnest(array[${standIns.map((row) => `'${row.user_id}'::uuid`).join(',')}]) u returning id`);
try {
  const full = (await talent(company, { action: 'company' })).j;
  check('after ten different learners the allowance is zero', full?.reveals_left_today === 0);
  const over = await reveal(company, other.address);
  check('an eleventh learner in the same day is refused', over.http === 429 && over.j?.error === 'reveal_limit' && over.j.reveals_per_day === 10 && leaks(over.j).length === 0 && !JSON.stringify(over.j).includes('bia.'));
  check('and nothing was recorded for the refused one', (await sql(`select count(*)::int n from itera.talent_contact_reveals where company_user_id = '${companyId}' and learner_user_id = '${otherId}'`))[0].n === 0);
  check('a learner already seen today can still be opened', (await reveal(company, fresh.address)).http === 200);
} finally {
  await sql(`delete from itera.talent_contact_reveals where id in (${fake.map((row) => `'${row.id}'`).join(',')})`);
}
let burst = null;
for (let attempt = 0; attempt < 14 && burst?.http !== 429; attempt += 1) burst = await reveal(company, fresh.address);
check('a burst of reveals from one account is slowed down (rate limit), whatever its allowance', burst?.http === 429 && burst.j?.error === 'rate_limited');

// ---- 5. Leaving deletes the contact -----------------------------------------------------------------------
const refusedOff = await call('privacy', fresh, { action: 'set_profile', public: false });
check('switching the profile off while listed is refused, and says why', refusedOff.http === 409 && refusedOff.j?.error === 'listed_on_talent_board');
const off = (await call('privacy', fresh, { action: 'set_profile', public: false, leave_board: true })).j;
check('with `leave_board` the same call leaves the board and switches the page off', off?.public_profile === false && off.talent.listed === false && off.talent.contact === null);
const gone = await sql(`select (select count(*) from itera.talent_contacts where user_id = '${freshId}')::int contacts, (select count(*) from itera.talent_listings where user_id = '${freshId}')::int listings`);
check('the contact row is DELETED, not hidden', gone[0].contacts === 0 && gone[0].listings === 0);
await sleep(61_000);
const after = await reveal(company, fresh.address);
check('a company that had seen it is no longer shown anything', after.http === 404 && after.j?.error === 'not_listed' && leaks(after.j).length === 0);
check('the board no longer has the card, and a stranger gets the private answer again', !((await get('talent-board?fresh=1')).j?.learners ?? []).some((entry) => entry.wallet === fresh.address) && (await get(`learner-profile/${fresh.address}?fresh=1`)).j?.private === true);
const left = (await talent(other, { action: 'unlist' })).j;
check('`unlist` deletes the contact of the other learner too', left?.listed === false && left.contact === null && (await sql(`select count(*)::int n from itera.talent_contacts where user_id = '${otherId}'`))[0].n === 0);
done();
