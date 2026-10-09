#!/usr/bin/env node
// Operator sync: runs the awarding and minting of `passport` for one learner
// without that learner's session, until nothing is left to mint.
//
//   node scripts/hackathon/passport-sync.mjs <wallet address | itera user id> [--lang pt|en]
//
// Environment (source ~/.config/itera-hackathon/supabase.env):
//   HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN (reads the service-role key; it is never printed).
import { execFileSync } from 'node:child_process';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_CALLS = 12;

function fail(message) {
  console.error(`passport-sync: ${message}`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is not set`);
  return value;
}

function psql(sql, variables) {
  const args = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`);
  return execFileSync('psql', args, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: requireEnv('HACKATHON_DB_PASSWORD') } }).trim();
}

/**
 * The keys the function may hold as its service key: this project's functions
 * get the `sb_secret_…` key, older ones the legacy `service_role` JWT.
 */
async function serviceKeys() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` },
  });
  if (!response.ok) fail(`could not read the project API keys (HTTP ${response.status})`);
  const keys = (await response.json())
    .filter((entry) => entry.type === 'secret' || entry.name === 'service_role')
    .sort((a, b) => Number(b.type === 'secret') - Number(a.type === 'secret'))
    .map((entry) => entry.api_key)
    .filter(Boolean);
  if (keys.length === 0) fail('the project has no service key');
  return keys;
}

function sync(key, userId, lang) {
  return fetch(`${SUPABASE_URL}/functions/v1/passport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, max_jobs: 10, lang }),
  });
}

/** The itera user behind a wallet address (its web3 identity) or the id itself. */
function resolveUser(target) {
  if (UUID.test(target)) {
    const found = psql(`select id from itera.users where id = :'id'::uuid;`, { id: target });
    return found || fail(`no itera user ${target}`);
  }
  if (!WALLET.test(target)) fail('expected a wallet address or an itera user id');
  const found = psql(
    `select i.user_id from auth.identities a
     join itera.identities i on i.provider_subject = a.user_id::text
     where a.provider = 'web3' and a.identity_data -> 'custom_claims' ->> 'address' = :'wallet'
     limit 1;`,
    { wallet: target },
  );
  return found || fail(`no learner has signed in with wallet ${target}`);
}

const [target, ...rest] = process.argv.slice(2);
if (!target) fail('usage: passport-sync.mjs <wallet address | itera user id> [--lang pt|en]');
const lang = rest[0] === '--lang' && (rest[1] === 'pt' || rest[1] === 'en') ? rest[1] : 'pt';

const userId = resolveUser(target);
const keys = await serviceKeys();
console.log(`itera user ${userId}`);

const seen = new Map();
let key = keys[0];
for (let call = 1; call <= MAX_CALLS; call += 1) {
  let response = await sync(key, userId, lang);
  for (const candidate of keys.slice(1)) {
    if (response.status !== 401) break;
    key = candidate;
    response = await sync(key, userId, lang);
  }
  const body = await response.json();
  if (!response.ok) fail(`passport answered HTTP ${response.status} ${body.error ?? ''}`);
  for (const award of [...body.awards, ...body.updated]) seen.set(award.id, award);
  console.log(`call ${call}: +${body.awards.length} awards, ${body.updated.length} updated, remaining ${body.remaining}, wallet ${body.mint.wallet ?? 'none'}, blocked ${body.mint.blocked ?? 'no'}`);
  if (body.mint.blocked) fail(`minting is blocked: ${body.mint.blocked}`);
  if (body.remaining === 0) break;
  if (call === MAX_CALLS) fail(`still ${body.remaining} transaction(s) due after ${MAX_CALLS} calls`);
}

const rows = psql(
  `select achievement_key, mint_status, coalesce(asset_address, ''), coalesce(state ->> 'days_done', ''), coalesce(state ->> 'total_days', ''), coalesce(state ->> 'tier', '')
   from itera.user_achievements where user_id = :'id'::uuid order by earned_at, id;`,
  { id: userId },
);
if (!rows) {
  console.log('this learner has no awards yet (no completed day)');
} else {
  console.log('\nkey | mint | detail | asset');
  const assets = new Set();
  for (const line of rows.split('\n')) {
    const [awardKey, status, asset, daysDone, totalDays, tier] = line.split('|');
    const detail = awardKey === 'trail_pass' ? `${daysDone}/${totalDays} ${tier}` : '';
    console.log(`${awardKey} | ${status} | ${detail} | ${asset}`);
    if (asset) assets.add(asset);
  }
  console.log('');
  for (const asset of assets) console.log(`https://explorer.solana.com/address/${asset}?cluster=devnet`);
  console.log(`\n${seen.size} award(s) created or changed by this run`);
}
