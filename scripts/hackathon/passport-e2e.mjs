#!/usr/bin/env node
// End-to-end check of the `passport` edge function against the hackathon project.
//
//   node scripts/hackathon/passport-e2e.mjs demo   [--lessons N] [--reset]
//   node scripts/hackathon/passport-e2e.mjs wallet [--lessons N]
//
// demo:   signs in as the demo (email) user. No wallet, so rows stay `unclaimed`.
// wallet: creates a throwaway wallet user through Sign in with Solana, so the
//         mint path runs (needs a funded minting authority).
//
// Both modes mark the next N unfinished lessons as completed straight in the
// database, call `passport` and print the response.
//
// Environment (source ~/.config/itera-hackathon/supabase.env):
//   HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN (or HACKATHON_ANON_KEY),
//   HACKATHON_DEMO_EMAIL + HACKATHON_DEMO_PASSWORD (demo mode).
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const SIWS_HOST = 'hackathon.iterahq.dev';
const PROGRAM_SLUG = process.env.PASSPORT_E2E_PROGRAM ?? 'itera-v2';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function fail(message) {
  console.error(`passport-e2e: ${message}`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is not set`);
  return value;
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (mode !== 'demo' && mode !== 'wallet') fail('usage: passport-e2e.mjs <demo|wallet> [--lessons N] [--reset]');
  const options = { mode, lessons: 1, reset: false };
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--reset') options.reset = true;
    else if (rest[index] === '--lessons') options.lessons = Number(rest[(index += 1)]);
    else fail(`unknown argument ${rest[index]}`);
  }
  if (!Number.isInteger(options.lessons) || options.lessons < 0 || options.lessons > 20) fail('--lessons must be 0..20');
  return options;
}

function psql(sql, variables = {}) {
  const args = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`);
  return execFileSync('psql', args, {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: requireEnv('HACKATHON_DB_PASSWORD') },
  }).trim();
}

async function anonKey() {
  if (process.env.HACKATHON_ANON_KEY) return process.env.HACKATHON_ANON_KEY;
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` },
  });
  if (!response.ok) fail(`could not read the project API keys (HTTP ${response.status})`);
  const key = (await response.json()).find((entry) => entry.name === 'anon')?.api_key;
  if (!key) fail('the project has no anon key');
  return key;
}

function base58(bytes) {
  let value = BigInt(`0x${bytes.toString('hex')}`);
  let encoded = '';
  while (value > 0n) {
    encoded = BASE58[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

async function token(apikey, grant, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    fail(`sign-in (${grant}) failed: HTTP ${response.status} ${payload.error_code ?? payload.msg ?? ''}`);
  }
  return payload;
}

async function signInDemo(apikey) {
  const session = await token(apikey, 'password', {
    email: requireEnv('HACKATHON_DEMO_EMAIL'),
    password: requireEnv('HACKATHON_DEMO_PASSWORD'),
  });
  return { accessToken: session.access_token, authUserId: session.user.id, wallet: null };
}

async function signInThrowawayWallet(apikey) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = base58(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  const message = [
    `${SIWS_HOST} wants you to sign in with your Solana account:`,
    address,
    '',
    'Sign in to Itera Hackathon',
    '',
    `URI: https://${SIWS_HOST}/login`,
    'Version: 1',
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
  const signature = sign(null, Buffer.from(message), privateKey).toString('base64url');
  const session = await token(apikey, 'web3', { chain: 'solana', message, signature });
  return { accessToken: session.access_token, authUserId: session.user.id, wallet: address };
}

function iteraUserId(authUserId) {
  const id = psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: authUserId });
  if (!id) fail(`auth user ${authUserId} has no itera identity`);
  return id;
}

function resetUser(userId) {
  psql(
    `delete from itera.user_achievements where user_id = :'user_id'::uuid;
     delete from itera.progress where user_id = :'user_id'::uuid;`,
    { user_id: userId },
  );
}

/** Completes the next `count` lessons of the program the learner has not finished yet. */
function completeNextLessons(userId, count) {
  if (count === 0) return [];
  const output = psql(
    `with next_lessons as (
       select l.id, u.ordinal as unit_ordinal, l.ordinal as lesson_ordinal
       from itera.lessons l
       join itera.units u on u.id = l.unit_id
       join itera.programs p on p.id = u.program_id
       where p.slug = :'program'
         and exists (
           select 1 from itera.activities a
           left join itera.progress pr on pr.activity_id = a.id and pr.user_id = :'user_id'::uuid
           where a.lesson_id = l.id and a.status = 'published' and pr.status is distinct from 'completed'
         )
       order by u.ordinal, l.ordinal, l.id
       limit :count
     ), written as (
       insert into itera.progress (user_id, activity_id, status, completed_at)
       select :'user_id'::uuid, a.id, 'completed', now()
       from itera.activities a
       join next_lessons n on n.id = a.lesson_id
       where a.status = 'published'
       on conflict (user_id, activity_id) do update set status = 'completed', completed_at = excluded.completed_at
       returning activity_id
     )
     select n.id || ' (' || (select count(*) from written w join itera.activities a on a.id = w.activity_id where a.lesson_id = n.id) || ' activities)'
     from next_lessons n order by n.unit_ordinal, n.lesson_ordinal;`,
    { user_id: userId, program: PROGRAM_SLUG, count: String(count) },
  );
  return output ? output.split('\n') : [];
}

async function callPassport(apikey, accessToken) {
  const startedAt = Date.now();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/passport`, {
    method: 'POST',
    headers: { apikey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'en' }),
  });
  return { status: response.status, ms: Date.now() - startedAt, body: await response.json() };
}

async function getJson(path) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`);
  return { status: response.status, body: await response.json() };
}

const options = parseArgs(process.argv.slice(2));
const apikey = await anonKey();
const session = options.mode === 'demo' ? await signInDemo(apikey) : await signInThrowawayWallet(apikey);
const userId = iteraUserId(session.authUserId);
console.log(`mode=${options.mode} itera_user=${userId} wallet=${session.wallet ?? 'none'}`);

if (options.reset) {
  resetUser(userId);
  console.log('reset: progress and achievements of this user deleted');
}
const completed = completeNextLessons(userId, options.lessons);
console.log(`completed ${completed.length} lesson(s) in ${PROGRAM_SLUG}:`, completed);

const first = await callPassport(apikey, session.accessToken);
console.log(`\npassport -> HTTP ${first.status} in ${first.ms} ms`);
console.log(JSON.stringify(first.body, null, 2));

const second = await callPassport(apikey, session.accessToken);
console.log(`\npassport (repeat) -> HTTP ${second.status} in ${second.ms} ms`);
console.log(JSON.stringify({ awards: second.body.awards?.length, updated: second.body.updated?.length, remaining: second.body.remaining, mint: second.body.mint }));

const sample = [...(first.body.awards ?? []), ...(first.body.updated ?? [])];
const row = sample.find((award) => award.key === 'trail_pass') ?? sample[0];
if (row) {
  const meta = await getJson(`credential-meta/${row.id}`);
  console.log(`\ncredential-meta/${row.id} -> HTTP ${meta.status}`);
  console.log(JSON.stringify(meta.body, null, 2));
}
const minted = sample.find((award) => award.asset_address);
if (minted) {
  const verify = await getJson(`credential-verify/${minted.asset_address}`);
  console.log(`\ncredential-verify/${minted.asset_address} -> HTTP ${verify.status}`);
  console.log(JSON.stringify(verify.body, null, 2));
} else {
  console.log(`\nnothing minted in this run (mint.blocked=${first.body.mint?.blocked ?? 'null'})`);
}
if (first.status !== 200 || second.status !== 200) process.exit(1);
