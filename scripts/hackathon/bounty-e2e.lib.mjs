// Shared plumbing of bounty-e2e.mjs and bounty-program-e2e.mjs: throwaway wallets kept in a local
// folder, wallet sign-in, the edge functions, the devnet RPC with backoff, SQL through the
// Management API. No secret lives in this file: keys and tokens come from the environment and from
// key files outside the repository.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { base58Encode } from '../../supabase/functions/_shared/solana-tx.ts';

export const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
export const FUNCTIONS = `https://${PROJECT_REF}.supabase.co/functions/v1`;
export const APP_ORIGIN = 'https://hackathon-colosseum.178-105-2-230.sslip.io';
const AUTH_URL = `https://${PROJECT_REF}.supabase.co/auth/v1`;
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const SIWS_HOST = 'hackathon.iterahq.dev';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const CONFIG_DIR = `${homedir()}/.config/itera-hackathon`;
const KEYS_DIR = process.env.BOUNTY_E2E_KEYS ?? `${CONFIG_DIR}/bounty-e2e-keys`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (source ~/.config/itera-hackathon/supabase.env and export it)`);
  return value;
}

let failures = 0;
let total = 0;
export function check(name, pass, detail = '') {
  total += 1;
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${String(detail).slice(0, 300)}` : ''}`);
}
export function done() {
  console.log(failures === 0 ? `\nALL PASS (${total} checks)` : `\n${failures} of ${total} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const explorer = (kind, value) => `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;

/** Runs SQL on the hackathon project through the Management API. Setup and read-back only. */
export async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`sql: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

let anon = null;
async function anonKey() {
  if (anon) return anon;
  if (process.env.HACKATHON_ANON_KEY) return (anon = process.env.HACKATHON_ANON_KEY);
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` } });
  if (!response.ok) throw new Error(`could not read the project API keys (HTTP ${response.status})`);
  return (anon = (await response.json()).find((entry) => entry.name === 'anon').api_key);
}

function signerOf(privateKey) {
  return { privateKey, address: base58Encode(createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32)) };
}

/** A devnet wallet kept under the local keys folder (outside the repository), so a rerun can reuse it. */
export function wallet(name) {
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  const file = `${KEYS_DIR}/${name}.json`;
  if (existsSync(file)) {
    return { name, ...signerOf(createPrivateKey({ key: Buffer.from(JSON.parse(readFileSync(file, 'utf8')).pkcs8, 'base64'), format: 'der', type: 'pkcs8' })) };
  }
  const { privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(file, JSON.stringify({ pkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') }), { mode: 0o600 });
  return { name, ...signerOf(privateKey) };
}

/** A signer from a Solana CLI key file (a JSON array of 64 bytes). */
export function keyFile(envName, fileName) {
  const secret = Uint8Array.from(JSON.parse(readFileSync(process.env[envName] ?? `${CONFIG_DIR}/${fileName}`, 'utf8')));
  return signerOf(createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secret.slice(0, 32))]), format: 'der', type: 'pkcs8' }));
}
export const loadTreasury = () => keyFile('HACKATHON_TREASURY_KEYFILE', 'devnet-treasury.json');
export const loadAuthority = () => keyFile('HACKATHON_AUTHORITY_KEYFILE', 'devnet-authority.json');

/** Signs in with the wallet, as the app's "Sign in with Solana" does. */
export async function login(signer) {
  const message = `${SIWS_HOST} wants you to sign in with your Solana account:\n${signer.address}\n\nSign in to Itera\n\nURI: https://${SIWS_HOST}/login\nVersion: 1\nIssued At: ${new Date().toISOString()}`;
  const signature = sign(null, Buffer.from(message), signer.privateKey).toString('base64url');
  const response = await fetch(`${AUTH_URL}/token?grant_type=web3`, { method: 'POST', headers: { apikey: await anonKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'solana', message, signature }) });
  const session = await response.json();
  if (!session.access_token) throw new Error(`login failed: ${JSON.stringify(session).slice(0, 200)}`);
  return Object.assign(signer, { token: session.access_token, authUid: session.user.id });
}

/** Calls an edge function, with the learner's session when one is given. */
export async function call(path, learner, body, method = 'POST') {
  const response = await fetch(`${FUNCTIONS}/${path}`, {
    method,
    headers: { apikey: await anonKey(), ...(learner ? { Authorization: `Bearer ${learner.token}` } : {}), 'Content-Type': 'application/json', Origin: APP_ORIGIN },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { http: response.status, j: await response.json().catch(() => null) };
}
export const get = (path) => call(path, null, null, 'GET');

/** One devnet RPC call. The public node throttles: a throttled call is retried with a growing pause. */
export async function rpc(method, params) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const body = response.status === 429 ? { error: { message: 'rate limits' } } : await response.json();
    if (body.error && /rate limit/i.test(body.error.message ?? '') && attempt < 8) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }
}
export const balance = async (address) => (await rpc('getBalance', [address, { commitment: 'confirmed' }])).value;
export const history = (address) => rpc('getSignaturesForAddress', [address, { limit: 20, commitment: 'confirmed' }]);
export const latestBlockhash = async () => (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;

export async function confirmed(signature, timeoutMs = 40_000) {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(800)) {
    const status = (await rpc('getSignatureStatuses', [[signature]])).value[0];
    if (status?.err) throw new Error(`transaction ${signature} failed`);
    if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) return signature;
  }
  throw new Error(`transaction ${signature} was not confirmed`);
}

/** The wire transaction of a single-signer message, base64. */
export function signed(signer, message) {
  return Buffer.concat([Buffer.from([1]), sign(null, Buffer.from(message), signer.privateKey), Buffer.from(message)]).toString('base64');
}
/** The wire transaction of a message several keys sign, base64: one signature per required signer, in the message's own order. */
export function signedBy(signers, message) {
  const required = message[0];
  const keys = Array.from({ length: required }, (_, index) => base58Encode(message.subarray(4 + 32 * index, 36 + 32 * index)));
  const signatures = keys.map((address) => {
    const signer = signers.find((candidate) => candidate.address === address);
    return signer ? sign(null, Buffer.from(message), signer.privateKey) : Buffer.alloc(64);
  });
  return Buffer.concat([Buffer.from([required]), ...signatures, Buffer.from(message)]).toString('base64');
}
export const sendBy = async (signers, message) => confirmed(await rpc('sendTransaction', [signedBy(signers, message), { encoding: 'base64', preflightCommitment: 'confirmed' }]));
/** The 64-byte signature of `signer` over a message, base64: what a wallet hands back when it only signs. */
export const signatureOf = (signer, message) => sign(null, Buffer.from(message), signer.privateKey).toString('base64');
export const send = async (signer, message) => confirmed(await rpc('sendTransaction', [signed(signer, message), { encoding: 'base64', preflightCommitment: 'confirmed' }]));
/** Signs the unsigned transaction a Solana Action answered (base64, one zeroed signature slot) and sends it. */
export const sendUnsigned = (signer, transactionBase64) => send(signer, Buffer.from(transactionBase64, 'base64').subarray(65));

/** Marks the lessons of days `from..to` of Week 1 as completed for a learner, the way the grader's rows end up. */
export const completeDays = (authUid, from, to) =>
  sql(
    `insert into itera.progress (user_id, activity_id, status, completed_at)
     select i.user_id, a.id, 'completed', now()
       from itera.identities i, itera.activities a
       join itera.lessons l on l.id = a.lesson_id join itera.units un on un.id = l.unit_id join itera.programs p on p.id = un.program_id
      where i.provider_subject = '${authUid}' and p.slug = 'itera-v2' and un.ordinal = 0 and l.ordinal between ${from - 1} and ${to - 1}
     on conflict do nothing`,
  );

/** Asks the passport function to mint and stamp what the learner earned, until nothing is left. */
export async function passport(learner) {
  let answer = null;
  for (let pass = 0; pass < 5; pass += 1) {
    answer = await call('passport', learner, {});
    if (answer.http !== 200 || !answer.j.remaining) break;
  }
  return answer;
}
