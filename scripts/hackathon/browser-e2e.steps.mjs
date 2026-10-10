// The steps of browser-e2e.mjs. Each one is independent enough to be re-run with `--steps`.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** Day-5 activities left open by the seed: a single choice (wrong answers cost lives) and the closing reveal. */
const OPEN_KINDS = ['single_choice', 'concept_reveal'];

export async function run(t) {
  const { page, wallet, report, check, note, snap, save, wants, setStep, tid, visible } = t;
  const state = { userId: null, signedInAt: null, trail: t.loadTrail() };
  const lastDay = state.trail.days.at(-1);
  // The LAST activity of each open kind: the proof question and the closing screen.
  state.open = OPEN_KINDS.map((kind) => lastDay.activities.filter((activity) => activity.kind === kind).at(-1)).filter(Boolean);
  state.lessonId = lastDay.lessonId;

  // ---------------------------------------------------------------- 1. login + nickname
  setStep('1 login');
  await t.signIn(page);
  await snap(page, 'login');
  await page.setViewportSize(t.MOBILE);
  await snap(page, 'login-mobile');
  await page.setViewportSize(t.DESKTOP);
  const loginStartedAt = Date.now();
  await tid(page, 'web3-solana').click();
  await t.waitSignedIn(page).then(
    () => check('"Continuar com Phantom" signs in with the injected wallet', true),
    async () => check('"Continuar com Phantom" signs in with the injected wallet', false, (await tid(page, 'login-error').textContent().catch(() => '')) ?? 'still on /login'),
  );
  t.timing('login: click -> signed in', Date.now() - loginStartedAt);
  state.signedInAt = Date.now();
  state.userId = await t.until(() => t.iteraUserOf(wallet.address), Boolean, 20, 1000);
  check('the wallet sign-in created an itera user', Boolean(state.userId), state.userId);
  report.iteraUserId = state.userId;
  if (!state.userId) return;
  const nameBefore = t.psql(`select display_name from itera.users where id = :'id'::uuid;`, { id: state.userId });

  if (wants(1)) {
    const gate = await visible(tid(page, 'nickname-gate'), 15_000);
    if (gate) {
      check('nickname step appears for an address-like name', true, `display_name was "${nameBefore}"`);
      await snap(page, 'nickname');
      await tid(page, 'nickname-input').fill(t.NICKNAME);
      await snap(page, 'nickname-filled');
      const savedAt = Date.now();
      await tid(page, 'nickname-submit').click();
      await tid(page, 'nickname-gate').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
      t.timing('nickname: submit -> gate closed', Date.now() - savedAt);
    } else if (nameBefore === t.NICKNAME) {
      note('nickname already set by an earlier run with this wallet: the step did not appear (expected)');
    } else {
      check('nickname step appears for an address-like name', false, `display_name is "${nameBefore}" and no gate showed`);
    }
    const title = await tid(page, 'welcome-title').textContent({ timeout: 20_000 }).catch(() => null);
    check(`dashboard greets "Bem-vindo de volta, ${t.NICKNAME}"`, title?.includes(`Bem-vindo de volta, ${t.NICKNAME}`), title ?? 'no welcome title');
    const nameAfter = t.psql(`select display_name from itera.users where id = :'id'::uuid;`, { id: state.userId });
    check('itera.users.display_name changed in the database', nameAfter === t.NICKNAME, `"${nameBefore}" -> "${nameAfter}"`);
    await snap(page, 'dashboard-empty');
    save();
  } else if (await visible(tid(page, 'nickname-gate'), 4000)) {
    await tid(page, 'nickname-skip').click();
  }

  // ---------------------------------------------------------------- 2. seeded dashboard + companion mint
  if (wants(2)) {
    setStep('2 dashboard');
    const already = Number(t.psql(`select count(*) from itera.progress where user_id = :'id'::uuid;`, { id: state.userId }));
    if (already === 0) {
      const rows = t.seedProgress(state.userId, state.trail, state.open.map((activity) => activity.id));
      note(`seeded ${rows} completed activities (days 1-4 on the four previous days, day 5 today), open on day 5: ${state.open.map((activity) => activity.kind).join(' + ')}`);
      const startedAt = Date.now();
      const out = execFileSync('node', [join(t.HERE, 'passport-sync.mjs'), state.userId], { encoding: 'utf8', env: process.env });
      t.timing('operator sync (passport-sync.mjs) of the seeded days', Date.now() - startedAt);
      console.log(out.split('\n').filter((line) => /^call|\|/.test(line)).join('\n'));
    } else {
      note(`this wallet already has ${already} progress rows: seeding skipped`);
    }
    const certification = t.certificationRow(state.userId);
    check('certification asset exists at 4/5 before the UI run', certification?.mint === 'minted' && certification.days === 4, JSON.stringify(certification));

    const companion = await t.until(() => t.companionRow(state.userId), (row) => row?.mint === 'minted', 60, 1500);
    check('companion asset minted in the background after the first login', companion?.mint === 'minted' && Boolean(companion.asset), JSON.stringify(companion));
    if (already === 0) t.timing('companion: sign-in -> minted (database poll, includes seeding time)', Date.now() - state.signedInAt);
    const minted = t.psql(`select extract(epoch from (minted_at - created_at))::numeric(10,1) from itera.companions where user_id = :'id'::uuid;`, { id: state.userId });
    note(`companion row created -> minted_at: ${minted} s (database timestamps)`);

    await page.goto(`${t.BASE}/`, { waitUntil: 'domcontentloaded' });
    await tid(page, 'welcome-title').waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await t.sleep(1500);
    await snap(page, 'dashboard');
    await snap(page, 'dashboard-full', { fullPage: true });
    const text = await page.locator('body').innerText();
    check('dashboard: HTML trail featured at day 5', /HTML/.test(text) && /dia 0?5 de 5/i.test(await tid(page, 'featured-trail').innerText().catch(() => text)), (await tid(page, 'featured-trail').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160));
    const hearts = await t.heartsOf(page);
    check('dashboard: hearts 5/5', hearts.some((label) => /5.*5/.test(label)) || /5\s*\/\s*5/.test(text), hearts.join(' | ') || 'no hearts label found');
    const panel = await tid(page, 'passport-card').first().innerText().catch(() => '');
    check('dashboard: certifications panel at 4/5', /4\s*\/\s*5/.test(panel) || /4\s*\/\s*5/.test(await tid(page, 'trail-cert').first().innerText().catch(() => '')), panel.replace(/\s+/g, ' ').slice(0, 160));
    const art = await page.evaluate(() => [...document.querySelectorAll('img')].map((img) => ({ src: img.src, ok: img.complete && img.naturalWidth > 0 })).filter((img) => /credential-meta/.test(img.src)));
    check('dashboard: certification art comes from the backend and loaded', art.length > 0 && art.every((img) => img.ok), art.map((img) => `${img.ok ? 'ok' : 'BROKEN'} ${img.src.replace(/^.*credential-meta/, '…')}`).join(' ; ') || 'no credential-meta image on the page');
    await page.setViewportSize(t.MOBILE);
    await t.sleep(800);
    await snap(page, 'dashboard-mobile');
    await snap(page, 'dashboard-mobile-full', { fullPage: true });
    await page.setViewportSize(t.DESKTOP);
    report.assets.companion = companion?.asset;
    report.assets.certification = certification?.asset;
    save();
  }
  report.state = { userId: state.userId, lessonId: state.lessonId, open: state.open };
  const later = await import('./browser-e2e.flows.mjs').catch((error) => (error.code === 'ERR_MODULE_NOT_FOUND' ? null : Promise.reject(error)));
  if (later) await later.run(t, state);
}
