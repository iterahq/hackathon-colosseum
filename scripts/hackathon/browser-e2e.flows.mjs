// Steps 3-8 of browser-e2e.mjs: lives, the refill purchase, the stamp ceremony, the shop, the
// public pages and the second sign-in.
const dump = (page) =>
  page.evaluate(() => ({
    url: location.pathname + location.search,
    ids: [...new Set([...document.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid')))].join(' '),
    buttons: [...document.querySelectorAll('button,a[href]')]
      .filter((node) => node.offsetParent)
      .map((node) => `${node.getAttribute('data-testid') ?? ''}|${node.disabled ? 'D' : ''}|${(node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 48)}`)
      .slice(0, 40),
  }));

const livesInDb = (t, userId) => t.companionRow(userId)?.lives ?? null;

async function heartsLabel(page) {
  const node = page.getByTestId('lesson-hearts').first();
  return ((await node.getAttribute('aria-label').catch(() => null)) ?? (await node.innerText().catch(() => ''))).replace(/\s+/g, ' ');
}

async function openLesson(t, state) {
  const { page, tid } = t;
  await page.goto(`${t.BASE}/lesson/${state.lessonId}`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'lesson-activity').waitFor({ timeout: 30_000 });
  await t.sleep(1200);
}

/** Picks an option of the open single choice by whether it is the correct one, and submits. */
async function answerChoice(t, state, correct) {
  const { page, tid } = t;
  const right = t.psql(`select spec -> 'options' -> ((select ordinality - 1 from jsonb_array_elements(spec -> 'options') with ordinality o(opt, ordinality) where opt ->> 'id' = spec ->> 'correct_option_id')::int) -> 'label' ->> 'pt' from itera.activities where id = :'id'::uuid;`, { id: state.open[0].id });
  const options = tid(page, 'single-choice-option');
  await options.first().waitFor({ timeout: 15_000 });
  const count = await options.count();
  for (let index = 0; index < count; index += 1) {
    const text = (await options.nth(index).innerText()).replace(/\s+/g, ' ').trim();
    if (text.includes(right.slice(0, 30)) === correct) {
      await options.nth(index).click();
      await tid(page, 'single-choice-submit').click();
      return text;
    }
  }
  throw new Error('no option matched');
}

/** Follows the purchase dialog until it rests, logging every phase with the time it took. */
async function followPurchase(t, label, { fund = true } = {}) {
  const { page, tid } = t;
  const dialog = tid(page, 'purchase-dialog');
  const startedAt = Date.now();
  const phases = [];
  let funded = false;
  for (;;) {
    const phase = await dialog.getAttribute('data-phase', { timeout: 500 }).catch(() => null);
    if (phase && phases.at(-1)?.phase !== phase) {
      phases.push({ phase, at: Date.now() - startedAt });
      if (['signing', 'confirming', 'funding', 'insufficient', 'failed', 'paid'].includes(phase) && !phases.some((entry) => entry.shot === phase)) {
        phases.at(-1).shot = phase;
        await t.snap(page, `${label}-${phase}`);
      }
    }
    if (phase === 'insufficient' && fund && !funded) {
      funded = true;
      t.note(`${label}: empty wallet -> the dialog offers "${(await tid(page, 'purchase-faucet').innerText()).trim()}"; body: "${(await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 200)}"`);
      await tid(page, 'purchase-faucet').click();
      continue;
    }
    if (phase === 'paid' || phase === 'failed' || phase === 'no_wallet' || (phase === 'insufficient' && funded && Date.now() - startedAt > 45_000)) break;
    if (Date.now() - startedAt > 90_000) break;
    await t.sleep(120);
  }
  const trail = phases.map((entry) => `${entry.phase}@${(entry.at / 1000).toFixed(1)}s`).join(' -> ');
  t.timing(`${label}: click -> ${phases.at(-1)?.phase ?? 'nothing'}  [${trail}]`, Date.now() - startedAt);
  const final = phases.at(-1)?.phase ?? null;
  if (final !== 'paid') t.note(`${label}: dialog ended in "${final}": ${(await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
  return { final, phases, text: (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ') };
}

/** Reads a paid purchase from the database and proves its transaction on devnet. */
async function provePurchase(t, state, itemKey, label) {
  const [intentId, signature, lamports, status] = t.psql(`select id, coalesce(tx_signature, ''), lamports, status from itera.purchases where user_id = :'user'::uuid and item_key = :'item' order by created_at desc limit 1;`, { user: state.userId, item: itemKey }).split('|');
  t.check(`${label}: purchase row is paid with a signature`, status === 'paid' && Boolean(signature), `${status} ${signature.slice(0, 16)}…`);
  if (!signature) return null;
  const treasury = t.psql(`select value from itera.onchain_config where key = 'treasury';`);
  const tx = await t.until(() => t.rpc('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]), Boolean, 10, 1500);
  const instructions = tx?.transaction?.message?.instructions ?? [];
  const transfer = instructions.find((instruction) => instruction.parsed?.type === 'transfer')?.parsed?.info;
  const memo = instructions.find((instruction) => instruction.program === 'spl-memo' || instruction.programId === t.MEMO_PROGRAM)?.parsed;
  t.check(`${label}: devnet transaction = transfer wallet -> treasury of the price, memo = intent id`, tx && tx.meta?.err === null && transfer?.source === t.wallet.address && transfer.destination === treasury && String(transfer.lamports) === lamports && memo === intentId, `transfer ${transfer?.lamports} -> ${transfer?.destination?.slice(0, 8)}… memo ${memo} fee ${tx?.meta?.fee} instructions ${instructions.length}`);
  t.report.purchases = [...(t.report.purchases ?? []), { item: itemKey, intentId, signature, lamports: Number(lamports) }];
  return { intentId, signature };
}

export async function run(t, state) {
  const { page, wallet, report, check, note, snap, save, wants, setStep, tid, visible } = t;
  const companion = t.companionRow(state.userId);

  // ---------------------------------------------------------------- 3. lose every life
  if (wants(3)) {
    setStep('3 lives');
    await openLesson(t, state);
    await snap(page, 'lesson-day5');
    check('day 5 opens on the first unfinished activity (the single choice)', (await tid(page, 'single-choice-options').count()) === 1, (await tid(page, 'lesson-eyebrow').innerText().catch(() => '')).replace(/\s+/g, ' '));
    let lives = livesInDb(t, state.userId);
    check('lesson hearts start in sync with the server', new RegExp(`${lives}`).test(await heartsLabel(page)), `hearts "${await heartsLabel(page)}" · server ${lives}`);
    let uiLosses = 0;
    let forced = false;
    for (let round = 0; round < 8 && lives > 0; round += 1) {
      const startedAt = Date.now();
      const picked = await answerChoice(t, state, false);
      const after = await t.until(() => livesInDb(t, state.userId), (value) => value === lives - 1, 20, 400);
      const ms = Date.now() - startedAt;
      if (after !== lives - 1) {
        check(`wrong answer ${round + 1} costs one life on the server`, false, `picked "${picked.slice(0, 40)}", lives stayed ${after}`);
        break;
      }
      uiLosses += 1;
      lives = after;
      await t.sleep(700);
      const label = await heartsLabel(page);
      check(`wrong answer ${uiLosses}: hearts drop to ${lives} and the server agrees`, new RegExp(`\\b${lives}\\b`).test(label), `hearts "${label}" · server ${lives} · ${(ms / 1000).toFixed(1)} s`);
      if (uiLosses === 1) {
        await snap(page, 'lesson-wrong-answer');
        console.log(JSON.stringify(await dump(page)));
      }
      if (lives === 0) {
        t.timing('last life: submit -> server at 0', ms);
        break;
      }
      const retry = page.getByRole('button', { name: /Tentar de novo/i }).first();
      if (await visible(retry, 6000)) {
        await retry.click();
        await t.sleep(500);
      } else {
        note(`after ${uiLosses} wrong answers the activity offers no "Tentar de novo": ${JSON.stringify((await dump(page)).buttons.slice(4))}`);
        break;
      }
    }
    if (lives > 0) {
      // The activity did not allow five mistakes: leave one life through the database and lose it in the UI.
      forced = true;
      t.psql(`update itera.companions set lives = 1, last_regen_at = now(), version = version + 1 where user_id = :'id'::uuid;`, { id: state.userId });
      note(`lives set to 1 through psql after ${uiLosses} losses in the UI; the last one is lost in the UI`);
      await openLesson(t, state);
      const startedAt = Date.now();
      await answerChoice(t, state, false);
      lives = await t.until(() => livesInDb(t, state.userId), (value) => value === 0, 25, 400);
      t.timing('last life: submit -> server at 0', Date.now() - startedAt);
    }
    note(forced ? `lives reached 0 with ${uiLosses} UI losses + a psql adjustment` : `all ${uiLosses} lives were lost in the UI, no database adjustment`);
    check('server lives = 0', lives === 0, lives);

    const gateStartedAt = Date.now();
    let gate = await visible(tid(page, 'lives-gate'), 4000);
    if (!gate) {
      await snap(page, 'lesson-zero-lives-before-gate');
      note(`at 0 lives the gate is not up while the verdict footer shows; buttons: ${JSON.stringify((await dump(page)).buttons.slice(4))}`);
      const next = page.getByRole('button', { name: /Tentar de novo|Continuar/i }).first();
      if (await visible(next, 3000)) await next.click();
      gate = await visible(tid(page, 'lives-gate'), 8000);
    }
    check('the out-of-lives gate appears', gate, `${((Date.now() - gateStartedAt) / 1000).toFixed(1)} s after the server reached 0`);
    const refillAtFirstPaint = (await tid(page, 'lives-gate-refill').innerText().catch(() => '')).replace(/\s+/g, ' ');
    await snap(page, 'lives-gate-first-paint');
    const priced = await t.until(async () => (await tid(page, 'lives-gate-refill').innerText().catch(() => '')).replace(/\s+/g, ' '), (label) => /US\$/.test(label), 20, 250);
    check('gate: the refill button states its price', /US\$\s*0\.10/.test(priced), `first paint "${refillAtFirstPaint}" · ${((Date.now() - gateStartedAt) / 1000).toFixed(1)} s later "${priced}"`);
    if (!/US\$/.test(refillAtFirstPaint)) note(`the gate first paints "${refillAtFirstPaint}" with no price; the price arrives later and the button grows (the shop list is only fetched when the gate mounts)`);
    await t.sleep(600);
    await snap(page, 'lives-gate');
    const gateText = (await tid(page, 'lives-gate').innerText().catch(() => '')).replace(/\s+/g, ' ');
    note(`gate copy: "${gateText.slice(0, 420)}"`);
    const chain = tid(page, 'lives-gate-chain');
    const chainText = (await chain.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const chainHref = await chain.getAttribute('href').catch(() => null);
    check('gate: the on-chain mirror link shows 0/5', /0\s*\/\s*5/.test(chainText) && /explorer\.solana\.com/.test(chainHref ?? ''), `"${chainText}" -> ${chainHref}`);
    check('gate: the mirror link opens on devnet', /cluster=devnet/.test(chainHref ?? ''), chainHref);
    const mirrorStartedAt = Date.now();
    const verify = await t.verifyUntil(companion.asset, (attributes) => attributes.lives === '0', 20);
    check('credential-verify of the companion asset reports lives 0 on chain', t.attributesOf(verify).lives === '0' && verify.body?.companion?.lives === 0 && verify.body.verified === true, JSON.stringify(verify.body?.companion ?? verify.body).slice(0, 160));
    t.timing('lives 0 visible on chain through credential-verify (from the gate)', Date.now() - mirrorStartedAt);
    await page.setViewportSize(t.MOBILE);
    await t.sleep(600);
    await snap(page, 'lives-gate-mobile');
    await page.setViewportSize(t.DESKTOP);
    save();
  }

  // ---------------------------------------------------------------- 4. refill from the gate
  if (wants(4)) {
    setStep('4 refill');
    if (!(await visible(tid(page, 'lives-gate'), 1500))) {
      await openLesson(t, state);
      await visible(tid(page, 'lives-gate'), 10_000);
    }
    const before = await t.balanceOf(wallet.address);
    note(`wallet balance before the refill: ${before} lamports`);
    await tid(page, 'lives-gate-refill').click();
    const outcome = await followPurchase(t, 'refill');
    check('"Recarregar vidas": the fake Phantom signs and broadcasts, the purchase confirms', outcome.final === 'paid', outcome.phases.map((entry) => entry.phase).join(' -> '));
    if (before === 0) check('an empty wallet is funded by the app\'s own faucet ("Pegar SOL de teste")', outcome.phases.some((entry) => entry.phase === 'funding') && (await t.balanceOf(wallet.address)) > 0, `balance now ${await t.balanceOf(wallet.address)}`);
    note(`paid dialog copy: "${outcome.text.slice(0, 300)}"`);
    const explorer = await tid(page, 'purchase-explorer').getAttribute('href').catch(() => null);
    check('paid dialog links the transaction on the devnet explorer', /explorer\.solana\.com\/tx\/.+cluster=devnet/.test(explorer ?? ''), explorer);
    await t.sleep(1500);
    const proofArt = await tid(page, 'purchase-art').evaluate((img) => ({ src: img.src.replace(/^.*functions\/v1/, '…'), ok: img.complete && img.naturalWidth > 0 })).catch(() => null);
    if (proofArt) check('paid dialog: the companion art in the proof box rendered', proofArt.ok, JSON.stringify(proofArt));
    const proofLabel = (await tid(page, 'purchase-explorer').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const shownHead = proofLabel.match(/^([1-9A-HJ-NP-Za-km-z]{6,})/)?.[1] ?? '';
    check('paid dialog: the signature shown is the transaction the link opens', Boolean(shownHead) && (explorer ?? '').includes(`/tx/${shownHead}`), `label "${proofLabel}" -> ${explorer}`);
    await snap(page, 'refill-paid-settled');
    await tid(page, 'purchase-done').click().catch(() => {});
    await t.sleep(1000);
    await snap(page, 'lesson-after-refill');
    const label = await heartsLabel(page);
    check('lives are back to 5/5 in the lesson and on the server', /\b5\b/.test(label) && livesInDb(t, state.userId) === 5, `hearts "${label}" · server ${livesInDb(t, state.userId)}`);
    check('the lesson resumes at the same activity', !(await visible(tid(page, 'lives-gate'), 500)) && (await tid(page, 'single-choice-options').count()) === 1 && page.url().includes(state.lessonId), (await tid(page, 'lesson-eyebrow').innerText().catch(() => '')).replace(/\s+/g, ' '));
    await provePurchase(t, state, 'life_refill', 'refill');
    const verify = await t.verifyUntil(companion.asset, (attributes) => attributes.lives === '5', 20);
    // The mirror of the refill lands a few seconds after the purchase: polled for up to 30 s (above), cache-busted.
    const row = t.psql(`select lives || ' / mirror_due ' || mirror_due from itera.companions where user_id = :'id'::uuid;`, { id: state.userId });
    check('companion attribute lives = 5 on chain (polled up to 30 s)', t.attributesOf(verify).lives === '5', `UI "${label}" · database lives ${row} · chain lives ${t.attributesOf(verify).lives} at ${new Date().toISOString()}`);
    save();
  }
  // ---------------------------------------------------------------- 5. finish day 5 -> stamp ceremony
  if (wants(5)) {
    setStep('5 ceremony');
    if (!page.url().includes('/lesson/')) await openLesson(t, state);
    const ceremony = tid(page, 'stamp-ceremony');
    let lastClickAt = Date.now();
    for (let round = 0; round < 8 && !(await visible(ceremony, 800)); round += 1) {
      if (await visible(tid(page, 'feedback-footer-continue'), 300)) {
        await tid(page, 'feedback-footer-retry').click().catch(() => tid(page, 'feedback-footer-continue').click());
      } else if ((await tid(page, 'single-choice-submit').count()) > 0) {
        await answerChoice(t, state, true);
        await tid(page, 'feedback-footer-continue').waitFor({ timeout: 10_000 });
        await snap(page, 'lesson-right-answer');
        await tid(page, 'feedback-footer-continue').click();
      } else if (await visible(tid(page, 'concept-continue'), 300)) {
        if (await visible(tid(page, 'concept-reveal-show'), 300)) await tid(page, 'concept-reveal-show').click();
        await t.sleep(400);
        await snap(page, 'lesson-last-activity');
        await tid(page, 'concept-continue').click();
      } else if (await visible(tid(page, 'lesson-complete'), 300)) {
        const summary = (await tid(page, 'lesson-complete').innerText()).replace(/\s+/g, ' ');
        const [done, total] = (summary.match(/(\d+)\/(\d+)/) ?? []).slice(1).map(Number);
        // Everything answered right: the plain card is up while `passport` runs; the ceremony replaces it.
        if (done === total) break;
        // "Lição concluída" with a miss left behind: no stamp. Walk back to the missed question.
        note(`the lesson shows its completion screen without a stamp ceremony: "${summary}"`);
        await snap(page, 'lesson-complete-with-a-miss');
        for (let back = 0; back < 6 && (await tid(page, 'single-choice-options').count()) === 0; back += 1) {
          await tid(page, 'lesson-prev').click();
          await t.sleep(700);
        }
      } else if (await tid(page, 'lesson-next').isEnabled().catch(() => false)) {
        await tid(page, 'lesson-next').click();
      } else {
        const state5 = await dump(page);
        note(`unexpected lesson screen: ${JSON.stringify(state5.buttons)}`);
        await snap(page, 'lesson-unexpected');
        const any = page.getByRole('button', { name: /Continuar|Concluir|Finalizar/i }).last();
        if (!(await visible(any, 500))) break;
        await any.click();
      }
      lastClickAt = Date.now();
      await t.sleep(900);
    }
    // What the learner sees from the last click on, sampled without touching the page.
    let stampedAt = null;
    let shownAt = null;
    const texts = [];
    const screens = [];
    for (let frame = 0; Date.now() - lastClickAt < 34_000; frame += 1) {
      const screen = (await ceremony.count()) > 0 ? `ceremony:${(await tid(page, 'ceremony-status').getAttribute('data-status').catch(() => null)) ?? 'no status row'}` : (await tid(page, 'lesson-complete').count()) > 0 ? 'plain "Lição concluída" card' : 'other';
      if (screens.at(-1)?.screen !== screen) {
        screens.push({ screen, at: Date.now() - lastClickAt });
        await snap(page, `ceremony-${String(screens.length).padStart(2, '0')}-${screen.replace(/[^a-z]+/gi, '-').slice(0, 24)}`);
      }
      const text = (await ceremony.innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (text && texts.at(-1) !== text) texts.push(text);
      if (!shownAt && screen.startsWith('ceremony')) shownAt = Date.now();
      if (!stampedAt && /carimbad[oa] na Solana/i.test(text)) {
        stampedAt = Date.now();
        await snap(page, 'ceremony-stamped');
      }
      if (shownAt && frame % 12 === 0) await snap(page, `ceremony-frame-${String(frame).padStart(3, '0')}`);
      if (stampedAt && Date.now() - stampedAt > 7000) break;
      await t.sleep(250);
    }
    const shown = Boolean(shownAt);
    note(`screens after the last click: ${screens.map((entry) => `${entry.screen} @${(entry.at / 1000).toFixed(1)}s`).join(' -> ')}`);
    check('finishing day 5 opens the stamp ceremony', shown, screens.map((entry) => entry.screen).join(' -> '));
    if (shown) t.timing('ceremony: last click -> ceremony on screen', shownAt - lastClickAt);
    check('the ceremony is the first thing shown (no plain card before it)', screens[0]?.screen.startsWith('ceremony') || screens[1]?.screen.startsWith('ceremony') && screens[0].screen === 'other', screens.slice(0, 3).map((entry) => `${entry.screen} @${(entry.at / 1000).toFixed(1)}s`).join(' -> '));
    await snap(page, 'ceremony-final');
    texts.forEach((text, index) => note(`ceremony text ${index + 1}: "${text.slice(0, 380)}"`));
    const final = texts.at(-1) ?? '';
    check('ceremony says "carimbado na Solana"', Boolean(stampedAt), (await tid(page, 'ceremony-status').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160));
    if (stampedAt) t.timing('ceremony: last click -> "carimbado na Solana"', stampedAt - lastClickAt);
    check('ceremony shows the 5th stamp and the gold tier', /5\s*(\/|de)\s*5/.test(final) && /ouro|gold|dourad/i.test(final), final.slice(0, 200));
    const links = await ceremony.locator('a[href*="explorer.solana.com"]').evaluateAll((nodes) => nodes.map((node) => `${node.innerText.replace(/\s+/g, ' ').trim()} -> ${node.href}`)).catch(() => []);
    check('ceremony carries a devnet transaction link', links.some((link) => /\/tx\/.+cluster=devnet/.test(link)), links.join(' ; ') || 'no explorer link');
    const medals = await tid(page, 'ceremony-medal').count();
    note(`ceremony medals shown: ${medals}`);
    console.log(JSON.stringify(await dump(page)));
    await page.setViewportSize(t.MOBILE);
    await t.sleep(700);
    await snap(page, 'ceremony-mobile');
    await page.setViewportSize(t.DESKTOP);

    const certification = await t.until(() => t.certificationRow(state.userId), (row) => row?.days === 5 && row.tier === 'gold', 30, 1500);
    check('database: certification 5/5 gold', certification?.days === 5 && certification.tier === 'gold', JSON.stringify(certification));
    const verify = await t.verifyUntil(certification.asset, (attributes) => attributes.tier === 'gold' && attributes.days_done === '5', 30);
    const attributes = t.attributesOf(verify);
    check('chain: certification asset days_done 5, tier gold, frozen, verified', attributes.days_done === '5' && attributes.tier === 'gold' && verify.body?.frozen === true && verify.body.verified === true && verify.body.owner === wallet.address, JSON.stringify(attributes));
    const rows = t.psql(`select achievement_key || ':' || mint_status from itera.user_achievements where user_id = :'id'::uuid order by earned_at, id;`, { id: state.userId }).split('\n');
    note(`achievement rows: ${rows.join(', ')}`);
    check('every achievement row is minted (nothing pending or failed)', rows.every((row) => row.endsWith(':minted')), rows.filter((row) => !row.endsWith(':minted')).join(', '));
    report.assets.certification = certification.asset;
    save();
  }

  // ---------------------------------------------------------------- 6. shop: outfit + ink
  if (wants(6)) {
    setStep('6 shop');
    const item = (key) => page.locator(`[data-testid="shop-item"][data-item="${key}"]`);
    const openShop = async () => {
      await page.goto(`${t.BASE}/shop`, { waitUntil: 'domcontentloaded' });
      await item('outfit_glasses').waitFor({ timeout: 30_000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await t.sleep(1000);
    };
    await openShop();
    await snap(page, 'shop');
    await snap(page, 'shop-full', { fullPage: true });
    const prices = await page.locator('[data-testid="shop-item"]').evaluateAll((nodes) => nodes.map((node) => `${node.dataset.item}=${node.dataset.state}:${node.querySelector('[data-testid="shop-price"]')?.innerText ?? '-'}`));
    note(`shop shelf: ${prices.join(' | ')}`);

    // --- glasses
    if ((await item('outfit_glasses').getAttribute('data-state')) === 'buy') {
      await item('outfit_glasses').getByTestId('shop-buy').click();
      const outcome = await followPurchase(t, 'glasses');
      check('shop: buying the glasses confirms', outcome.final === 'paid', outcome.phases.map((entry) => entry.phase).join(' -> '));
      note(`glasses paid dialog: "${outcome.text.slice(0, 240)}"`);
      await tid(page, 'purchase-done').click().catch(() => {});
      await provePurchase(t, state, 'outfit_glasses', 'glasses');
    }
    await t.until(() => item('outfit_glasses').getAttribute('data-state'), (value) => value !== 'buy', 20, 500);
    check('shop: the glasses card turns "owned"', ['owned', 'equipped'].includes(await item('outfit_glasses').getAttribute('data-state')), await item('outfit_glasses').getAttribute('data-state'));
    await snap(page, 'shop-glasses-owned');
    if ((await item('outfit_glasses').getAttribute('data-state')) === 'owned') {
      const equipAt = Date.now();
      await item('outfit_glasses').getByTestId('shop-equip').click();
      await t.until(() => item('outfit_glasses').getAttribute('data-state'), (value) => value === 'equipped', 40, 300);
      t.timing('equip: click -> card "equipped"', Date.now() - equipAt);
      const chainAt = Date.now();
      const verify = await t.verifyUntil(companion.asset, (attributes) => attributes.outfit === 'outfit_glasses', 30);
      check('chain: companion attribute outfit = outfit_glasses', t.attributesOf(verify).outfit === 'outfit_glasses', JSON.stringify(t.attributesOf(verify)));
      t.timing('equip: outfit visible on chain through credential-verify', Date.now() - equipAt);
      void chainAt;
    }
    check('database: companion outfit = outfit_glasses', t.companionRow(state.userId)?.outfit === 'outfit_glasses', t.companionRow(state.userId)?.outfit);
    await page.evaluate(() => window.scrollTo(0, 0));
    await t.sleep(800);
    await snap(page, 'shop-glasses-equipped');
    const stageOutfit = await tid(page, 'shop-stage').getByTestId('tera-outfit').first().getAttribute('data-outfit').catch(() => null);
    check('shop stage: the learner\'s Tera wears the glasses', stageOutfit === 'outfit_glasses', `data-outfit=${stageOutfit} · "${(await tid(page, 'shop-wearing').innerText().catch(() => '')).replace(/\s+/g, ' ')}"`);
    const stageArt = await tid(page, 'shop-companion-art').evaluate((img) => ({ src: img.src, ok: img.complete && img.naturalWidth > 0 })).catch(() => null);
    note(`shop on-chain card art: ${JSON.stringify(stageArt)}`);
    await page.goto(`${t.BASE}/`, { waitUntil: 'domcontentloaded' });
    await tid(page, 'welcome-title').waitFor({ timeout: 30_000 });
    await t.sleep(1500);
    const stripOutfit = await tid(page, 'welcome-strip').getByTestId('tera-outfit').first().getAttribute('data-outfit').catch(() => null);
    check('dashboard welcome strip: Tera wears the glasses', stripOutfit === 'outfit_glasses', `data-outfit=${stripOutfit}`);
    await snap(page, 'dashboard-with-glasses');
    await tid(page, 'welcome-strip').screenshot({ path: `${t.OUT}/zoom-welcome-strip-glasses.png` }).catch(() => {});

    // --- emerald ink for the HTML certification
    await openShop();
    const before = t.certificationRow(state.userId);
    const artBefore = await (await fetch(`${t.FUNCTIONS}/credential-meta/${before.id}/image.svg?lang=pt&v=before-${Date.now()}`)).text();
    if ((await item('ink_emerald').getAttribute('data-state')) === 'buy') {
      note(`certification picker: "${(await tid(page, 'shop-cert-target').innerText().catch(() => 'absent')).replace(/\s+/g, ' ')}"`);
      await item('ink_emerald').scrollIntoViewIfNeeded();
      await item('ink_emerald').getByTestId('shop-buy').click();
      const outcome = await followPurchase(t, 'ink');
      check('shop: buying ink_emerald for the HTML certification confirms', outcome.final === 'paid', outcome.phases.map((entry) => entry.phase).join(' -> '));
      note(`ink paid dialog: "${outcome.text.slice(0, 240)}"`);
      await t.sleep(1500);
      const proofArt = await tid(page, 'purchase-art').evaluate((img) => ({ src: img.src, ok: img.complete && img.naturalWidth > 0 })).catch(() => null);
      check('ink paid dialog shows the refreshed certification art', Boolean(proofArt?.ok), JSON.stringify(proofArt));
      await snap(page, 'ink-paid-settled');
      await tid(page, 'purchase-done').click().catch(() => {});
      await provePurchase(t, state, 'ink_emerald', 'ink');
    }
    const verifyInk = await t.verifyUntil(before.asset, (attributes) => attributes.ink === 'emerald', 30);
    check('chain: certification attribute ink = emerald (days and tier kept)', t.attributesOf(verifyInk).ink === 'emerald' && t.attributesOf(verifyInk).days_done === String(before.days), JSON.stringify(t.attributesOf(verifyInk)));
    const artAfter = await (await fetch(`${t.FUNCTIONS}/credential-meta/${before.id}/image.svg?lang=pt&v=after-${Date.now()}`)).text();
    check('backend art carries the emerald ink', artAfter.includes('data-ink="emerald"'), `before ${artBefore.match(/data-ink="[^"]+"/)?.[0]} · after ${artAfter.match(/data-ink="[^"]+"/)?.[0]}`);
    await snap(page, 'shop-after-ink');

    const boughtAt = Date.now();
    const artOn = async (label) => {
      const images = await page.evaluate(() => [...document.querySelectorAll('img')].filter((img) => /credential-meta/.test(img.src)).map((img) => ({ src: img.src, ok: img.complete && img.naturalWidth > 0, width: Math.round(img.getBoundingClientRect().width) })));
      // The page may address the art by any row of the certification (trail_pass, trail_complete): take the large ones.
      const mine = images.filter((img) => img.src.includes(before.id) || img.width >= 200);
      const svgs = await Promise.all(mine.map(async (img) => (await (await fetch(img.src)).text()).match(/data-ink="[^"]+"/)?.[0] ?? 'no data-ink'));
      check(`${label}: the certification art on the page is the emerald one`, mine.length > 0 && mine.every((img) => img.ok) && svgs.every((ink) => ink === 'data-ink="emerald"'), `${Math.round((Date.now() - boughtAt) / 1000)} s after the purchase: ` + mine.map((img, index) => `${img.width}px ${svgs[index]} ${img.src.replace(/^.*credential-meta/, '…')}`).join(' ; ') || `no art for the certification among ${images.length} images: ${images.map((img) => img.src.replace(/^.*credential-meta/, '…')).join(' ')}`);
    };
    await page.goto(`${t.BASE}/passport`, { waitUntil: 'domcontentloaded' });
    await tid(page, 'passport-full-card').first().waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await t.sleep(1500);
    await snap(page, 'certifications');
    await snap(page, 'certifications-full', { fullPage: true });
    await artOn('/passport');
    await page.setViewportSize(t.MOBILE);
    await t.sleep(700);
    await snap(page, 'certifications-mobile-full', { fullPage: true });
    await page.goto(`${t.BASE}/shop`, { waitUntil: 'domcontentloaded' });
    await item('outfit_glasses').waitFor({ timeout: 30_000 });
    await t.sleep(1500);
    await snap(page, 'shop-mobile-full', { fullPage: true });
    await page.setViewportSize(t.DESKTOP);
    await page.goto(`${t.BASE}/c/${before.asset}`, { waitUntil: 'domcontentloaded' });
    await tid(page, 'credential-page').waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await t.sleep(1500);
    await snap(page, 'credential-signed-in');
    await artOn(`/c/${before.asset.slice(0, 6)}…`);
    save();
  }

  // ---------------------------------------------------------------- 7. public pages, no wallet, no login
  if (wants(7)) {
    setStep('7 public');
    const certification = t.certificationRow(state.userId);
    const companionNow = t.companionRow(state.userId);
    const anonymous = await t.browser.newContext({ viewport: t.DESKTOP, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const visitor = await anonymous.newPage();
    visitor.setDefaultTimeout(10_000);
    t.watch(visitor, 'public');
    const profile = await t.publicJson(`learner-profile/${wallet.address}?lang=pt&t=${Date.now()}`);
    const view = async (path, testId, name) => {
      await visitor.setViewportSize(t.DESKTOP);
      const startedAt = Date.now();
      await visitor.goto(`${t.BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await visitor.getByTestId(testId).waitFor({ timeout: 30_000 });
      await visitor.waitForLoadState('networkidle').catch(() => {});
      await t.sleep(1500);
      t.timing(`${name}: open -> settled`, Date.now() - startedAt);
      await snap(visitor, `public-${name}`);
      await snap(visitor, `public-${name}-full`, { fullPage: true });
      await visitor.setViewportSize(t.MOBILE);
      await t.sleep(700);
      await snap(visitor, `public-${name}-mobile-full`, { fullPage: true });
      const text = (await visitor.locator('body').innerText()).replace(/\s+/g, ' ');
      const images = await visitor.evaluate(() => [...document.querySelectorAll('img')].filter((img) => /credential-meta/.test(img.src)).map((img) => img.complete && img.naturalWidth > 0));
      const hasWallet = await visitor.evaluate(() => 'solana' in window);
      return { text, images, hasWallet };
    };
    const cert = await view(`/c/${certification.asset}`, 'credential-page', 'certification');
    note(`/c/<certification> text: "${cert.text.slice(0, 500)}"`);
    check('/c/<certification>: opens with no wallet and no session', !cert.hasWallet && !/Entrar para continuar/.test(cert.text));
    check('/c/<certification>: verified, 5/5, gold, owner wallet shown', /[Vv]erificad/.test(cert.text) && /5\s*(\/|de)\s*5/.test(cert.text) && /ouro|gold|dourad/i.test(cert.text) && cert.text.includes(wallet.address.slice(0, 4)), cert.text.slice(0, 160));
    check('/c/<certification>: art loaded', cert.images.length > 0 && cert.images.every(Boolean), `${cert.images.length} images`);
    const comp = await view(`/c/${companionNow.asset}`, 'credential-page', 'companion');
    note(`/c/<companion> text: "${comp.text.slice(0, 500)}"`);
    const chainCompanion = (await t.verifyAsset(companionNow.asset)).body?.companion;
    check('/c/<companion>: verified, with lives and the outfit as on chain', /[Vv]erificad/.test(comp.text) && new RegExp(`${chainCompanion?.lives}\\s*(/|de)\\s*5`).test(comp.text), `chain ${JSON.stringify({ lives: chainCompanion?.lives, outfit: chainCompanion?.outfit })} · database lives ${companionNow.lives} outfit ${companionNow.outfit}`);
    check('/c/<companion>: art loaded', comp.images.length > 0 && comp.images.every(Boolean), `${comp.images.length} images`);
    const user = await view(`/u/${wallet.address}`, 'profile-page', 'profile');
    note(`/u/<wallet> text: "${user.text.slice(0, 600)}"`);
    const body = profile.body ?? {};
    note(`learner-profile: verified_count ${body.verified_count}, companion ${JSON.stringify({ lives: body.companion?.lives, outfit: body.companion?.outfit, verified: body.companion?.verified })}, certifications ${JSON.stringify((body.certifications ?? []).map((entry) => ({ days: entry.days_done, tier: entry.tier, ink: entry.ink, verified: entry.verified })))}, medals ${(body.medals ?? []).map((medal) => `${medal.key}:${medal.verified}`).join(',')}`);
    const cards = { certs: await visitor.getByTestId('profile-cert').count(), medals: await visitor.getByTestId('profile-medal').count(), companion: await visitor.getByTestId('profile-companion').count() };
    check('/u/<wallet>: lists what learner-profile returns (companion, certifications, medals)', cards.companion === (body.companion ? 1 : 0) && cards.certs === (body.certifications ?? []).length && cards.medals === (body.medals ?? []).length, `page ${JSON.stringify(cards)} · api ${body.companion ? 1 : 0}/${(body.certifications ?? []).length}/${(body.medals ?? []).length}`);
    check('/u/<wallet>: everything is verified on chain', body.verified_count === 1 + (body.certifications ?? []).length + (body.medals ?? []).length && body.verified_count > 0, `verified_count ${body.verified_count}`);
    check('/u/<wallet>: values agree with the database (5/5 gold, emerald ink, glasses)', body.certifications?.[0]?.days_done === certification.days && body.certifications[0].tier === certification.tier && body.certifications[0].ink === 'emerald' && body.companion?.outfit === (companionNow.outfit || null), `database ${certification.days}/${certification.tier}/${companionNow.outfit}`);
    check('/u/<wallet>: art loaded', user.images.length > 0 && user.images.every(Boolean), `${user.images.filter(Boolean).length}/${user.images.length} images`);
    await anonymous.close();
    save();
  }

  // ---------------------------------------------------------------- 8. sign out, sign in again
  if (wants(8)) {
    setStep('8 second sign-in');
    await page.setViewportSize(t.DESKTOP);
    await page.goto(`${t.BASE}/`, { waitUntil: 'domcontentloaded' });
    await tid(page, 'welcome-title').waitFor({ timeout: 30_000 });
    const chip = page.locator('header button, nav button').filter({ hasText: wallet.address.slice(0, 4) }).first();
    await chip.click().catch(() => {});
    await t.sleep(500);
    await snap(page, 'profile-menu');
    const signOut = page.getByText(/^Sair$/).first();
    if (await visible(signOut, 3000)) {
      await signOut.click();
    } else {
      note('no "Sair" entry found in the profile menu: the session was dropped by clearing storage instead');
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${t.BASE}/login`);
    }
    const out = await page.waitForFunction(() => !Object.keys(localStorage).some((key) => key.startsWith('sb-') && key.endsWith('-auth-token')), null, { timeout: 15_000 }).then(() => true, () => false);
    check('sign out ends the session', out, page.url().replace(t.BASE, ''));
    await t.sleep(1000);
    await snap(page, 'signed-out');
    const calls = report.providerCalls.length;
    await t.signIn(page);
    const startedAt = Date.now();
    await tid(page, 'web3-solana').click();
    await t.waitSignedIn(page).catch(() => {});
    t.timing('second login: click -> signed in', Date.now() - startedAt);
    const title = await tid(page, 'welcome-title').textContent({ timeout: 20_000 }).catch(() => null);
    check('second sign-in with the same wallet lands on the same account', t.iteraUserOf(wallet.address) === state.userId && Boolean(title), title);
    check('nickname step does not reappear', !(await visible(tid(page, 'nickname-gate'), 4000)) && title?.includes(t.NICKNAME), title);
    await page.waitForLoadState('networkidle').catch(() => {});
    await t.sleep(1500);
    await snap(page, 'dashboard-second-login');
    await snap(page, 'dashboard-second-login-full', { fullPage: true });
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const stripOutfit = await tid(page, 'welcome-strip').getByTestId('tera-outfit').first().getAttribute('data-outfit').catch(() => null);
    check('state persists: trail complete 5/5, glasses on, lives as on the server', /5\s*\/\s*5 dias/.test(text) && stripOutfit === 'outfit_glasses', `outfit ${stripOutfit} · ${text.match(/\d\/5 dias/g)?.join(',')} · server lives ${livesInDb(t, state.userId)}`);
    note(`provider calls of the second login: ${report.providerCalls.slice(calls).map((call) => `${call.method}(${call.detail})`).join(' ; ')}`);
    await page.setViewportSize(t.MOBILE);
    await t.sleep(700);
    await snap(page, 'dashboard-second-login-mobile');
    await page.setViewportSize(t.DESKTOP);
    save();
  }
}
