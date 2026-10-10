#!/usr/bin/env node
// Browser end-to-end run of the on-chain flows on the LIVE hackathon site, driven by Playwright
// with a FAKE PHANTOM: `window.solana` is installed before any app code runs and is backed by a real
// ed25519 keypair that never leaves this Node process. Devnet only.
//
//   node scripts/hackathon/browser-e2e.mjs                       # fresh throwaway wallet, every step
//   node scripts/hackathon/browser-e2e.mjs --wallet /tmp/w.json  # reuse (or create) a wallet file
//   node scripts/hackathon/browser-e2e.mjs --wallet /tmp/w.json --steps 6,7
// Steps live in browser-e2e.steps.mjs (1-2) and browser-e2e.flows.mjs (3-8).
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD,
// SUPABASE_ACCESS_TOKEN (operator sync of the seeded days). See docs/browser-e2e.md.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const FUNCTIONS = `https://${PROJECT_REF}.supabase.co/functions/v1`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const PROTECTED_WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
const PROGRAM_SLUG = 'itera-v2';
const NICKNAME = 'QA Tera';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const BASE = (option('base', 'https://hackathon-colosseum.178-105-2-230.sslip.io')).replace(/\/$/, '');
const OUT = option('out', '/tmp/hk-e2e');
const WALLET_FILE = option('wallet');
const STEPS = option('steps') ? new Set(option('steps').split(',').map(Number)) : null;
const wants = (step) => !STEPS || STEPS.has(step);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

// --- base58 / keys ------------------------------------------------------------------------------
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let text = '';
  while (value > 0n) {
    text = ALPHABET[Number(value % 58n)] + text;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    text = `1${text}`;
  }
  return text;
}
function base58Decode(text) {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error('not base58');
    value = value * 58n + BigInt(digit);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const body = value === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let zeros = 0;
  for (const char of text) {
    if (char !== '1') break;
    zeros += 1;
  }
  return Buffer.concat([Buffer.alloc(zeros), body]);
}

/** The learner's wallet: a fresh keypair, or the one stored in `--wallet <file>` (created when missing). */
function loadWallet() {
  let seed;
  if (WALLET_FILE && existsSync(WALLET_FILE)) {
    seed = Buffer.from(JSON.parse(readFileSync(WALLET_FILE, 'utf8')).slice(0, 32));
  } else {
    const { privateKey } = generateKeyPairSync('ed25519');
    seed = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  }
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const publicBytes = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
  if (WALLET_FILE && !existsSync(WALLET_FILE)) {
    writeFileSync(WALLET_FILE, JSON.stringify([...seed, ...publicBytes]), { mode: 0o600 });
    chmodSync(WALLET_FILE, 0o600);
  }
  return { privateKey, publicBytes, address: base58Encode(publicBytes) };
}

// --- database / chain / public functions ---------------------------------------------------------
function psql(sql, variables = {}) {
  if (!process.env.HACKATHON_DB_PASSWORD) throw new Error('HACKATHON_DB_PASSWORD is not set');
  const cli = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) cli.push('-v', `${name}=${value}`);
  return execFileSync('psql', cli, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.HACKATHON_DB_PASSWORD } }).trim();
}

async function rpc(method, params) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (response.status === 429 && attempt < 6) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const payload = await response.json();
    if (payload.error) {
      const error = new Error(`${method}: ${payload.error.message ?? JSON.stringify(payload.error)}`.slice(0, 400));
      error.code = payload.error.code;
      throw error;
    }
    return payload.result;
  }
}
const balanceOf = async (address) => (await rpc('getBalance', [address, { commitment: 'confirmed' }])).value;

async function until(read, done, tries = 40, pauseMs = 1500) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    last = await read();
    if (done(last)) return last;
    await sleep(pauseMs);
  }
  return last;
}

async function publicJson(path) {
  const response = await fetch(`${FUNCTIONS}/${path}`);
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: null, text };
  }
}
/** `credential-verify` is cached 20 s per URL: a throwaway query reads the chain again. */
const verifyAsset = (asset) => publicJson(`credential-verify/${asset}?t=${Date.now()}`);
const attributesOf = (verify) => Object.fromEntries((verify.body?.attributes ?? []).map(({ key, value }) => [key, value]));
const verifyUntil = (asset, done, tries = 30) => until(() => verifyAsset(asset), (verify) => done(attributesOf(verify), verify), tries, 1500);

// --- report --------------------------------------------------------------------------------------
const report = { base: BASE, startedAt: new Date().toISOString(), wallet: null, checks: [], timings: [], providerCalls: [], consoleErrors: [], failedRequests: [], notes: [], assets: {} };
let currentStep = 'boot';
let shot = Number(option('shot-start', '0'));

function check(name, pass, detail = '') {
  const entry = { step: currentStep, name, pass: Boolean(pass), detail: String(detail ?? '').slice(0, 220) };
  report.checks.push(entry);
  console.log(`${entry.pass ? 'PASS' : 'FAIL'}  [${currentStep}] ${name}${entry.detail ? `  (${entry.detail})` : ''}`);
  return entry.pass;
}
function timing(name, ms) {
  report.timings.push({ step: currentStep, name, ms });
  console.log(`TIME  [${currentStep}] ${name}: ${seconds(ms)}`);
}
function note(text) {
  report.notes.push({ step: currentStep, text });
  console.log(`NOTE  [${currentStep}] ${text}`);
}
function save() {
  writeFileSync(join(OUT, `results${STEPS ? `-${[...STEPS].join('_')}` : ''}.json`), JSON.stringify(report, null, 2));
}
async function snap(page, name, options = {}) {
  shot += 1;
  const file = join(OUT, `${String(shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false }).catch((error) => console.log(`screenshot ${name} failed: ${error.message}`));
  return file;
}
async function timed(name, run) {
  const startedAt = Date.now();
  const value = await run();
  timing(name, Date.now() - startedAt);
  return value;
}

// --- the fake Phantom ----------------------------------------------------------------------------
/** Runs in the page before any app code. Signing is delegated to Node through exposed functions. */
function installFakePhantom({ address, publicBytes }) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const encode58 = (bytes) => {
    let value = 0n;
    for (const byte of bytes) value = value * 256n + BigInt(byte);
    let text = '';
    while (value > 0n) {
      text = ALPHABET[Number(value % 58n)] + text;
      value /= 58n;
    }
    for (const byte of bytes) {
      if (byte !== 0) break;
      text = `1${text}`;
    }
    return text;
  };
  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const describe = (value) => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
    if (typeof value === 'object') return `{${Object.keys(value).map((key) => `${key}: ${value[key] instanceof Uint8Array ? `Uint8Array(${value[key].length})` : typeof value[key] === 'function' ? 'fn' : typeof value[key]}`).join(', ')}}`;
    return typeof value;
  };
  const log = (method, detail) => window.__fakePhantomLog?.(method, detail, location.pathname);
  const rejection = (code, message) => Object.assign(new Error(message), { code });

  const TRUSTED_KEY = '__fake_phantom_trusted';
  const publicKey = {
    toBase58: () => address,
    toString: () => address,
    toJSON: () => address,
    toBytes: () => Uint8Array.from(publicBytes),
    toBuffer: () => Uint8Array.from(publicBytes),
    equals: (other) => other?.toBase58?.() === address,
  };
  const listeners = new Map();
  const emit = (event, ...values) => (listeners.get(event) ?? []).forEach((listener) => listener(...values));
  const trust = () => {
    provider.publicKey = publicKey;
    provider.isConnected = true;
    localStorage.setItem(TRUSTED_KEY, '1');
    emit('connect', publicKey);
  };
  const signBytes = async (bytes) => fromBase64(await window.__fakePhantomSign(toBase64(bytes)));
  const sendMessage = async (messageBytes) => {
    const answer = await window.__fakePhantomSignAndSend(toBase64(messageBytes));
    if (answer.error) throw rejection(answer.code ?? -32003, answer.error);
    return { signature: answer.signature, publicKey: address };
  };
  /** A web3.js-like transaction object: the message bytes are all a wallet needs to sign. */
  const messageOf = (transaction) => {
    if (typeof transaction?.serializeMessage === 'function') return transaction.serializeMessage();
    if (typeof transaction?.message?.serialize === 'function') return transaction.message.serialize();
    throw rejection(-32602, 'Fake Phantom: transaction has no serializeMessage()');
  };

  const provider = {
    isPhantom: true,
    isFakePhantom: true,
    publicKey: null,
    isConnected: false,
    async connect(options) {
      log('connect', describe(options));
      // A real Phantom rejects the silent connect of a site it has not approved yet.
      if (options?.onlyIfTrusted && !localStorage.getItem(TRUSTED_KEY)) throw rejection(4001, 'User rejected the request.');
      trust();
      return { publicKey };
    },
    async disconnect() {
      log('disconnect', '');
      provider.publicKey = null;
      provider.isConnected = false;
      emit('disconnect');
    },
    on(event, listener) {
      log('on', event);
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return provider;
    },
    off(event, listener) {
      log('off', event);
      listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== listener));
      return provider;
    },
    removeListener(event, listener) {
      return provider.off(event, listener);
    },
    async signMessage(message, display) {
      log('signMessage', `${describe(message)}, ${describe(display)}`);
      const signature = await signBytes(message);
      return { signature, publicKey };
    },
    /** Sign-In-With-Solana, as Phantom implements it: the wallet writes the message and signs it. */
    async signIn(input = {}) {
      log('signIn', describe(input));
      const lines = [`${input.domain ?? location.host} wants you to sign in with your Solana account:`, input.address ?? address];
      if (input.statement) lines.push('', input.statement);
      const fields = [
        ['URI', input.uri],
        ['Version', input.version],
        ['Chain ID', input.chainId],
        ['Nonce', input.nonce],
        ['Issued At', input.issuedAt],
        ['Expiration Time', input.expirationTime],
        ['Not Before', input.notBefore],
        ['Request ID', input.requestId],
      ].filter(([, value]) => value);
      if (fields.length > 0) lines.push('', ...fields.map(([label, value]) => `${label}: ${value}`));
      if (input.resources?.length) lines.push('Resources:', ...input.resources.map((resource) => `- ${resource}`));
      const signedMessage = new TextEncoder().encode(lines.join('\n'));
      const signature = await signBytes(signedMessage);
      trust();
      return { address: publicKey, signedMessage, signature };
    },
    async signTransaction(transaction) {
      log('signTransaction', describe(transaction));
      const signature = await signBytes(messageOf(transaction));
      transaction.addSignature?.(publicKey, signature);
      return transaction;
    },
    async signAllTransactions(transactions) {
      log('signAllTransactions', `Array(${transactions?.length})`);
      for (const transaction of transactions) transaction.addSignature?.(publicKey, await signBytes(messageOf(transaction)));
      return transactions;
    },
    async signAndSendTransaction(transaction, options) {
      log('signAndSendTransaction', `${describe(transaction)}, ${describe(options)}`);
      return sendMessage(messageOf(transaction));
    },
    async request(call) {
      const { method, params } = call ?? {};
      log(`request:${method}`, describe(params));
      if (method === 'connect') return provider.connect(params);
      if (method === 'disconnect') return provider.disconnect();
      if (method === 'signMessage') return provider.signMessage(params?.message, params?.display);
      if (method === 'signAndSendTransaction') {
        if (typeof params?.message !== 'string') throw rejection(-32602, 'Fake Phantom: params.message (base58) is required');
        return window.__fakePhantomSignAndSend(params.message, 'base58').then((answer) => {
          if (answer.error) throw rejection(answer.code ?? -32003, answer.error);
          return { signature: answer.signature, publicKey: address };
        });
      }
      if (method === 'signTransaction') {
        if (typeof params?.message !== 'string') throw rejection(-32602, 'Fake Phantom: params.message (base58) is required');
        const answer = await window.__fakePhantomSign(params.message, 'base58');
        return { signature: encode58(fromBase64(answer)), publicKey: address };
      }
      throw rejection(-32601, `Fake Phantom: method ${method} is not supported`);
    },
  };
  window.solana = provider;
  window.phantom = { solana: provider };
}

async function attachWallet(context, wallet) {
  if (wallet.address === PROTECTED_WALLET) throw new Error('refusing to run with the owner wallet');
  const decode = (payload, encoding) => (encoding === 'base58' ? base58Decode(payload) : Buffer.from(payload, 'base64'));
  await context.exposeFunction('__fakePhantomLog', (method, detail, path) => {
    report.providerCalls.push({ step: currentStep, method, detail, path });
    console.log(`WALLET [${currentStep}] ${method}(${detail}) on ${path}`);
  });
  await context.exposeFunction('__fakePhantomSign', (payload, encoding) => sign(null, decode(payload, encoding), wallet.privateKey).toString('base64'));
  await context.exposeFunction('__fakePhantomSignAndSend', async (payload, encoding) => {
    const message = decode(payload, encoding);
    if (message[0] !== 1) return { error: `Fake Phantom: expected a legacy message with one signer, header byte is ${message[0]}`, code: -32602 };
    const signature = sign(null, message, wallet.privateKey);
    const transaction = Buffer.concat([Buffer.from([1]), signature, message]);
    const startedAt = Date.now();
    try {
      const sent = await rpc('sendTransaction', [transaction.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }]);
      report.timings.push({ step: currentStep, name: 'fake Phantom: sendTransaction (devnet RPC)', ms: Date.now() - startedAt });
      report.sent = [...(report.sent ?? []), { step: currentStep, signature: sent }];
      return { signature: sent };
    } catch (error) {
      return { error: error.message, code: error.code ?? -32003 };
    }
  });
  await context.addInitScript(installFakePhantom, { address: wallet.address, publicBytes: [...wallet.publicBytes] });
}

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() !== 'error' && !(message.type() === 'warning' && /\[wallet\]|\[purchase\]/.test(message.text()))) return;
    report.consoleErrors.push({ step: currentStep, page: label, type: message.type(), text: message.text().slice(0, 400), url: page.url().replace(BASE, '') });
  });
  page.on('pageerror', (error) => report.consoleErrors.push({ step: currentStep, page: label, type: 'pageerror', text: String(error.message).slice(0, 400), url: page.url().replace(BASE, '') }));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(failure)) return;
    report.failedRequests.push({ step: currentStep, page: label, status: 0, method: request.method(), url: request.url().slice(0, 200), body: failure });
  });
  page.on('response', async (response) => {
    if (response.status() < 400) return;
    const body = await response.text().catch(() => '');
    report.failedRequests.push({ step: currentStep, page: label, status: response.status(), method: response.request().method(), url: response.url().slice(0, 200), body: body.slice(0, 200) });
  });
}

// --- database views of the throwaway learner -----------------------------------------------------
function iteraUserOf(walletAddress) {
  return psql(
    `select i.user_id from auth.identities a
     join itera.identities i on i.provider_subject = a.user_id::text
     where a.provider = 'web3' and a.identity_data -> 'custom_claims' ->> 'address' = :'wallet' limit 1;`,
    { wallet: walletAddress },
  );
}
const companionRow = (userId) => {
  const [lives, mint, asset, outfit, id] = psql(`select lives, mint_status, coalesce(asset_address, ''), coalesce(outfit, ''), id from itera.companions where user_id = :'user_id'::uuid;`, { user_id: userId }).split('|');
  return lives === undefined || lives === '' ? null : { lives: Number(lives), mint, asset, outfit, id };
};
const certificationRow = (userId) => {
  const [id, asset, days, tier, mint, unit] = psql(`select id, coalesce(asset_address, ''), state ->> 'days_done', state ->> 'tier', mint_status, ref_id from itera.user_achievements where user_id = :'user_id'::uuid and achievement_key = 'trail_pass' limit 1;`, { user_id: userId }).split('|');
  return id ? { id, asset, days: Number(days), tier, mint, unit } : null;
};

/** The first trail: per day, the lesson and its published activities in order. */
function loadTrail() {
  const rows = psql(
    `select u.id, l.id, string_agg(a.id::text || ':' || a.kind, ',' order by a.ordinal, a.id)
     from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
     join itera.activities a on a.lesson_id = l.id and a.status = 'published'
     where p.slug = :'program' and u.ordinal = 0 group by u.id, l.id, l.ordinal order by l.ordinal;`,
    { program: PROGRAM_SLUG },
  );
  const days = rows.split('\n').map((line) => {
    const [unitId, lessonId, activities] = line.split('|');
    return { unitId, lessonId, activities: activities.split(',').map((entry) => ({ id: entry.split(':')[0], kind: entry.split(':')[1] })) };
  });
  return { unitId: days[0].unitId, days };
}

/**
 * Days 1-4 completed on the four previous days, day 5 completed today except `open`.
 * Progress + one XP event per activity, as the app writes them.
 */
function seedProgress(userId, trail, open) {
  const done = [];
  trail.days.forEach((day, index) => {
    for (const activity of day.activities) {
      if (index === trail.days.length - 1 && open.includes(activity.id)) continue;
      done.push(`${activity.id}:${trail.days.length - 1 - index}`);
    }
  });
  psql(
    `with seed as (
       select split_part(entry, ':', 1)::uuid as activity_id,
              case when split_part(entry, ':', 2)::int = 0 then now() - interval '20 minutes'
                   else now() - make_interval(days => split_part(entry, ':', 2)::int) end as at
       from unnest(string_to_array(:'done', ',')) as entry
     ), wrote as (
       insert into itera.progress (user_id, activity_id, status, completed_at)
       select :'user_id'::uuid, activity_id, 'completed', at from seed
       on conflict (user_id, activity_id) do update set status = 'completed', completed_at = excluded.completed_at
       returning activity_id
     )
     insert into itera.xp_events (user_id, tenant_id, amount, reason, created_at)
     select :'user_id'::uuid, (select tenant_id from itera.memberships where user_id = :'user_id'::uuid limit 1), 10, 'activity_complete:' || seed.activity_id, seed.at
     from seed
     where not exists (select 1 from itera.xp_events x where x.user_id = :'user_id'::uuid and x.reason = 'activity_complete:' || seed.activity_id);`,
    { user_id: userId, done: done.join(',') },
  );
  return done.length;
}

// --- page helpers --------------------------------------------------------------------------------
const tid = (page, id) => page.getByTestId(id);
const visible = (locator, timeout = 1500) => locator.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const button = tid(page, 'web3-solana');
  await button.waitFor({ state: 'visible', timeout: 30_000 });
  return button;
}

/** Waits until the app left /login (a session exists). */
async function waitSignedIn(page) {
  await page.waitForFunction(() => !location.pathname.startsWith('/login') && Object.keys(localStorage).some((key) => key.startsWith('sb-') && key.endsWith('-auth-token')), null, { timeout: 30_000 });
}

async function heartsOf(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[aria-label]')].filter((node) => /\d\s*(de|\/|of)\s*\d.*vida|vidas?:?\s*\d|\d\/\d/i.test(node.getAttribute('aria-label') ?? ''));
    return nodes.map((node) => node.getAttribute('aria-label'));
  });
}

export { base58Decode, base58Encode, installFakePhantom };

// --- the run -------------------------------------------------------------------------------------
async function main() {
  mkdirSync(OUT, { recursive: true });
  const wallet = loadWallet();
  report.wallet = wallet.address;
  console.log(`wallet ${wallet.address} (throwaway${WALLET_FILE ? `, ${WALLET_FILE}` : ''}) · ${BASE}`);

  const browser = await chromium.launch({ headless: true });
  const contextOptions = { viewport: DESKTOP, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', recordVideo: option('video') === 'off' ? undefined : { dir: join(OUT, 'video'), size: { width: 1280, height: 800 } } };
  const context = await browser.newContext(contextOptions);
  await attachWallet(context, wallet);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  watch(page, 'app');

  const steps = await import('./browser-e2e.steps.mjs');
  const tools = { BASE, OUT, DESKTOP, MOBILE, NICKNAME, FUNCTIONS, MEMO_PROGRAM, wallet, report, browser, context, page, wants, check, timing, timed, note, snap, save, sleep, until, psql, rpc, balanceOf, publicJson, verifyAsset, verifyUntil, attributesOf, iteraUserOf, companionRow, certificationRow, loadTrail, seedProgress, tid, visible, signIn, waitSignedIn, heartsOf, watch, base58Decode, base58Encode, HERE, setStep: (name) => (currentStep = name), contextOptions, attachWallet };
  try {
    await steps.run(tools);
  } catch (error) {
    check('run completed without an exception', false, error.stack?.split('\n').slice(0, 3).join(' | '));
    await snap(page, 'crash');
  } finally {
    report.finishedAt = new Date().toISOString();
    save();
    await context.close();
    await browser.close();
  }
  const failed = report.checks.filter((entry) => !entry.pass);
  console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed · results in ${OUT}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('browser-e2e failed:', error);
    process.exit(1);
  });
}
