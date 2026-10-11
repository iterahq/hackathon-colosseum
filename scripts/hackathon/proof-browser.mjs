#!/usr/bin/env node
// Player plumbing on the LIVE site: a learner answers in the browser, the answer goes to `grade`, the
// browser writes no completion. Signs a throwaway wallet in (session injected, no wallet extension).
//   node scripts/hackathon/proof-browser.mjs [--base https://...] [--out /tmp/hk/proof/shots]
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN.
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { base58Encode } from '../../supabase/functions/_shared/solana-tx.ts';
import { PROJECT_REF, SUPABASE_URL, anonKey, check, psql, summary } from './social-e2e.lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const BASE = option('base', 'https://hackathon-colosseum.178-105-2-230.sslip.io').replace(/\/$/, '');
const OUT = option('out', '/tmp/hk/proof/shots');
const SIWS_HOST = 'hackathon.iterahq.dev';

async function walletSession(apikey) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = base58Encode(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  const message = [`${SIWS_HOST} wants you to sign in with your Solana account:`, address, '', 'Sign in to Itera Hackathon', '', `URI: https://${SIWS_HOST}/login`, 'Version: 1', `Issued At: ${new Date().toISOString()}`].join('\n');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'solana', message, signature: sign(null, Buffer.from(message), privateKey).toString('base64url') }) });
  const session = await response.json();
  if (!response.ok || !session.access_token) throw new Error(`sign-in failed: HTTP ${response.status}`);
  const userId = psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: session.user.id });
  return { session, userId, address };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const apikey = await anonKey();
  const { session, userId, address } = await walletSession(apikey);
  console.log(`wallet ${address} · itera user ${userId} · ${BASE}`);
  const lesson = psql(
    `select l.id from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
     where p.slug = 'itera-v2' order by u.ordinal, l.ordinal, l.id limit 1;`,
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [`sb-${PROJECT_REF}-auth-token`, JSON.stringify(session)]);
    const page = await context.newPage();
    const gradeCalls = [];
    const progressWrites = [];
    page.on('response', async (response) => {
      const request = response.request();
      const url = response.url();
      if (url.includes('/functions/v1/grade') && request.method() === 'POST') {
        gradeCalls.push({ status: response.status(), sent: request.postDataJSON(), body: await response.json().catch(() => null), ms: request.timing().responseEnd });
      }
      if (url.includes('/rest/v1/progress') && request.method() !== 'GET') progressWrites.push(`${request.method()} ${response.status()} ${request.postData()?.slice(0, 80)}`);
    });

    await page.goto(`${BASE}/lesson/${lesson}`, { waitUntil: 'domcontentloaded' });
    const activity = page.getByTestId('lesson-activity');
    // A new wallet learner is asked once what to be called.
    const gate = page.getByTestId('nickname-gate');
    if (await gate.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)) {
      await page.getByTestId('nickname-input').fill('QA Proof');
      await page.getByTestId('nickname-submit').click();
      await gate.waitFor({ state: 'hidden', timeout: 15_000 });
    }
    await activity.waitFor({ state: 'visible', timeout: 45_000 });
    await page.screenshot({ path: `${OUT}/1-first-activity.png` });

    // Activities 1 and 2 of day 1 are concept cards: one button moves on, and that is the answer.
    for (let step = 0; step < 2; step += 1) {
      const before = gradeCalls.length;
      await page.getByRole('button', { name: /^(Continuar|Continue)$/ }).last().click({ timeout: 15_000 });
      for (let wait = 0; wait < 40 && gradeCalls.length === before; wait += 1) await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/2-after-two.png` });

    check('the player sent each settled activity to grade', gradeCalls.length >= 2 && gradeCalls.every((call) => call.status === 200 && call.body?.verdict === 'pass'), JSON.stringify(gradeCalls.map((call) => [call.status, call.body?.verdict, call.body?.mode, Math.round(call.ms)])));
    check('the browser wrote no completion itself', progressWrites.length === 0, progressWrites.join(' | '));
    const rows = psql(`select count(*) filter (where status = 'completed' and not written_by_client) || '/' || count(*) from itera.progress where user_id = :'user_id'::uuid;`, { user_id: userId });
    const attempts = psql(`select count(*) from itera.graded_attempts where user_id = :'user_id'::uuid and passed;`, { user_id: userId });
    check('the completions are in the database, written by the server, each with an attempt', /^([2-9])\/\1$/.test(rows) && Number(attempts) >= 2, `progress ${rows} · passing attempts ${attempts}`);

    // A forged completion from this very session, the way the old player wrote it.
    const forged = await page.evaluate(
      async ([url, key, token, user, activityId]) => {
        const response = await fetch(`${url}/rest/v1/progress?on_conflict=user_id,activity_id`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Profile': 'itera', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ user_id: user, activity_id: activityId, status: 'completed', completed_at: new Date().toISOString() }),
        });
        return response.status;
      },
      [SUPABASE_URL, apikey, session.access_token, userId, psql(`select id from itera.activities where lesson_id = :'lesson'::uuid and status = 'published' order by ordinal desc, id limit 1;`, { lesson })],
    );
    const afterForge = psql(`select count(*) from itera.progress where user_id = :'user_id'::uuid and status = 'completed';`, { user_id: userId });
    check('a completion forged from the browser console is refused', forged >= 400 && afterForge === rows.split('/')[1], `HTTP ${forged} · completed rows ${afterForge}`);
  } finally {
    await browser.close();
  }
  const { total, failed } = summary();
  console.log(`\n${total - failed.length}/${total} checks passed${failed.length ? `\nFAILED:\n  ${failed.join('\n  ')}` : ''}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('proof-browser failed:', error);
  process.exit(1);
});
