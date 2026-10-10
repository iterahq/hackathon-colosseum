// Shared plumbing of social-e2e.mjs: psql, devnet RPC, throwaway wallet learners.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { base58Encode, base64Encode, buildTransferMessage, serializeTransaction } from '../../supabase/functions/_shared/solana-tx.ts';

export const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
export const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
export const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const SIWS_HOST = 'hackathon.iterahq.dev';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
export const PROTECTED_WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';

const results = [];
export function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 160)})` : ''}`);
}
export const summary = () => ({ total: results.length, failed: results.filter((entry) => !entry.pass).map((entry) => entry.name) });
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const sol = (lamports) => (Number(lamports) / 1e9).toFixed(6);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function psql(sql, variables = {}) {
  const args = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`);
  return execFileSync('psql', args, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: requireEnv('HACKATHON_DB_PASSWORD') } }).trim();
}

export async function rpc(method, params) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (response.status === 429 && attempt < 5) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const payload = await response.json();
    if (payload.error) throw new Error(`${method}: ${JSON.stringify(payload.error).slice(0, 300)}`);
    return payload.result;
  }
}
export const balance = async (address) => BigInt((await rpc('getBalance', [address, { commitment: 'confirmed' }])).value);

async function waitConfirmed(signature) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = (await rpc('getSignatureStatuses', [[signature]])).value[0];
    if (status?.err) throw new Error(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
    await sleep(700);
  }
  throw new Error(`transaction ${signature} was not confirmed`);
}

export function loadAuthority() {
  const file = process.env.HACKATHON_AUTHORITY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-authority.json`;
  const secret = Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secret.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  return { privateKey, address: base58Encode(secret.slice(32)) };
}

/** Signs a serialized legacy message and submits it, as a wallet's `signAndSendTransaction` does. */
export async function signAndSend(signer, message) {
  const signature = sign(null, Buffer.from(message), signer.privateKey);
  const sent = await rpc('sendTransaction', [base64Encode(serializeTransaction(message, signature)), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  await waitConfirmed(sent);
  return sent;
}

export async function fund(authority, recipient, lamports) {
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  return signAndSend(authority, buildTransferMessage({ payer: authority.address, recipient, lamports, memo: 'social-e2e: funding', recentBlockhash: blockhash }));
}

export async function anonKey() {
  if (process.env.HACKATHON_ANON_KEY) return process.env.HACKATHON_ANON_KEY;
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` } });
  if (!response.ok) throw new Error(`could not read the project API keys (HTTP ${response.status})`);
  return (await response.json()).find((entry) => entry.name === 'anon').api_key;
}

/** A throwaway wallet learner: signed in with Solana, with a client for the edge functions and one for PostgREST. */
export async function newLearner(apikey, label) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = base58Encode(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  if (address === PROTECTED_WALLET) throw new Error('refusing the protected wallet');
  const message = [`${SIWS_HOST} wants you to sign in with your Solana account:`, address, '', 'Sign in to Itera Hackathon', '', `URI: https://${SIWS_HOST}/login`, 'Version: 1', `Issued At: ${new Date().toISOString()}`].join('\n');
  const signature = sign(null, Buffer.from(message), privateKey).toString('base64url');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'solana', message, signature }) });
  const session = await response.json();
  if (!response.ok || !session.access_token) throw new Error(`sign-in failed: HTTP ${response.status}`);
  const userId = psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: session.user.id });
  const headers = { apikey, 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
  const call = async (name, body = {}) => {
    const answer = await fetch(`${FUNCTIONS}/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: answer.status, body: await answer.json() };
  };
  const get = async (name) => {
    const answer = await fetch(`${FUNCTIONS}/${name}`, { headers });
    return { status: answer.status, body: await answer.json() };
  };
  const rest = async (query) => (await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: { ...headers, 'Accept-Profile': 'itera' } })).json();
  console.log(`${label}: wallet ${address} · itera user ${userId}`);
  return { privateKey, address, userId, call, get, rest, label };
}

export async function publicGet(path) {
  const answer = await fetch(`${FUNCTIONS}/${path}`);
  return { status: answer.status, body: await answer.json() };
}

export async function until(read, done, tries = 40, pauseMs = 1500) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    last = await read();
    if (done(last)) return last;
    await sleep(pauseMs);
  }
  return last;
}

/** Gives a learner xp in their own tenant, as the app's ledger would hold it. */
export function seedXp(userId, amount) {
  psql(
    `insert into itera.xp_events (user_id, tenant_id, amount, reason)
     select :'user_id'::uuid, tenant_id, :amount, 'social-e2e' from itera.memberships where user_id = :'user_id'::uuid order by created_at limit 1;`,
    { user_id: userId, amount },
  );
}

/** A test tenant with `staff` as its instructor and `learners` as learners. Left behind, flagged `is_test`. */
export function makeTenant(label, staff, learners = []) {
  const slug = `social-e2e-${label}-${Date.now().toString(36)}`;
  const tenantId = psql(`insert into itera.tenants (slug, name, is_test, live_class_enabled) values (:'slug', :'slug', true, true) returning id;`, { slug }).split('\n')[0];
  psql(`insert into itera.memberships (user_id, tenant_id, role) values (:'user_id'::uuid, :'tenant'::uuid, 'instructor');`, { user_id: staff.userId, tenant: tenantId });
  for (const learner of learners) {
    psql(`insert into itera.memberships (user_id, tenant_id, role) values (:'user_id'::uuid, :'tenant'::uuid, 'learner');`, { user_id: learner.userId, tenant: tenantId });
  }
  return tenantId;
}

/**
 * The cast every teacher feature shares, created once per run: an instructor and four learners in
 * one test tenant, and an instructor of ANOTHER tenant who is only a learner in the shared one.
 */
export async function cast(context) {
  if (context.cast) return context.cast;
  const { apikey } = context;
  const instructor = await newLearner(apikey, 'instructor');
  const learners = [];
  for (const name of ['learner 1', 'learner 2', 'learner 3', 'learner 4']) learners.push(await newLearner(apikey, name));
  const outsider = await newLearner(apikey, 'instructor of another tenant');
  const tenantId = makeTenant('class', instructor, learners);
  const otherTenantId = makeTenant('other', outsider);
  context.cast = { instructor, learners, outsider, tenantId, otherTenantId };
  return context.cast;
}
