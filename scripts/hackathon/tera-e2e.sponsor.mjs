// The sponsor half of tera-e2e.mjs: a bounty with a prize Tera, posted, funded, delivered and paid on devnet.
import { compileMessage, decodeMessage } from '../../supabase/functions/_shared/solana-message.ts';
import { SYSTEM_PROGRAM, buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { acceptBounty, balance, call, check, completeDays, explorer, get, latestBlockhash, login, passport, rpc, send, sleep, sql, wallet } from './bounty-e2e.lib.mjs';

const UNIT = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const REWARD = 10_000_000;
const SPONSOR_FUNDING = 60_000_000n;
const PRIZE_TOTAL = 14_000_000;
const FUNCTIONS = 'https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1';

const tag = (who, reason) => sql(`insert into itera.test_accounts (user_id, reason) select i.user_id, 'tera-e2e: ${reason}' from itera.identities i where i.provider_subject = '${who.authUid}' on conflict (user_id) do nothing`);
const transaction = (signature) => rpc('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
const page = async (slug) => (await get(`bounty-board/${slug}?lang=en`)).j;
const post = async (who, body) => {
  for (let attempt = 0; ; attempt += 1) {
    const answer = await call('bounty-post', who, body);
    if (answer.http !== 429 || attempt >= 3) return answer;
    await sleep(20_000);
  }
};
const confirmUntil = async (who, bounty, want) => {
  let answer = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    answer = await post(who, { action: 'confirm', bounty, note: 'tera-e2e: approved' });
    if (answer.j?.status === want) break;
    await sleep(1500);
  }
  return answer;
};
const form = (stamp, label, prize) => ({
  action: 'create',
  sponsor_name: `E2E Sponsor ${stamp}`,
  title: { en: `Tera e2e ${label} ${stamp}` },
  summary: { en: 'Automated test of a bounty that carries a sponsor Tera as its prize.' },
  brief: { en: 'Context: an automated end-to-end run. What to do: deliver any https link; the script that posted this approves it.' },
  deliverable: { en: 'An https link to the page.' },
  reward_lamports: REWARD,
  unit_id: UNIT,
  min_days: 1,
  expires_in_days: 1,
  claim_hours: 1,
  ...(prize === undefined ? {} : { prize_tera: prize }),
});

export async function sponsorPart({ stamp, report, treasury }) {
  const switchRow = await sql(`select value from itera.onchain_config where key = 'prize_tera'`);
  if (!switchRow[0]) throw new Error('onchain_config.prize_tera is missing: apply migration 0352 first');
  if (switchRow[0].value !== 'on') throw new Error('onchain_config.prize_tera is not on: this script does not flip it, nothing was sent');

  {
    const sponsor = await login(wallet(`tera-e2e-s-${stamp}`));
    const learner = await login(wallet(`tera-e2e-l-${stamp}`));
    await tag(sponsor, 'sponsor');
    await tag(learner, 'paid learner');
    console.log(`sponsor ${sponsor.address}\nlearner ${learner.address}`);
    await completeDays(learner.authUid, 1, 1);
    const stamped = await passport(learner);
    check('the learner holds a certification with one stamped day', stamped.http === 200 && stamped.j?.remaining === 0);
    await send(treasury, buildTransferMessage({ payer: treasury.address, recipient: sponsor.address, lamports: SPONSOR_FUNDING, memo: 'tera-e2e: sponsor top-up', recentBlockhash: await latestBlockhash() }));

    // ---- What the form offers, and what it refuses ------------------------------------------------
    const options = (await get('bounty-post')).j?.prize_tera;
    check('the posting form offers the prize: a few base Teras, the mint cost and the fee, no upload', options?.enabled === true && options.bases.length >= 3 && options.total_lamports === PRIZE_TOTAL && options.mint_lamports + options.fee_lamports === PRIZE_TOTAL && options.transferable === false, JSON.stringify({ bases: options?.bases?.map((base) => base.key), total: options?.total_lamports }));
    const base = options.bases[1].key;
    const refused = async (label, prize) => {
      const answer = await post(sponsor, form(stamp, 'refused', prize));
      check(`a prize with ${label} is refused, and nothing is posted`, answer.http === 400 && answer.j?.error === 'invalid_prize_tera', JSON.stringify(answer.j));
    };
    await refused('markup in the brand', { brand: '<script>alert(1)</script>', accent: '#ff8800', base });
    await refused('an attribute break in the brand', { brand: 'Acme"/><image href="https://evil.example/x.png"/>', accent: '#ff8800', base });
    await refused('markup in the colour', { brand: 'Acme Labs', accent: '#ff8800"/><script>', base });
    await refused('a base outside the short list (an earn-only Tera)', { brand: 'Acme Labs', accent: '#ff8800', base: 'brand_phoenix_full' });
    await refused('a path as the base', { brand: 'Acme Labs', accent: '#ff8800', base: '../../x' });
    await refused('a brand posing as the team', { brand: 'Itera Official', accent: '#ff8800', base });
    await refused('the name of a tenant this wallet is not staff of', { brand: 'DevFellowship', accent: '#16a34a', base });
    await refused('a look-alike letter of another script (Cyrillic I)', { brand: '\u0406tera Labs', accent: '#ff8800', base });
    await refused('an uploaded file instead of the three values', { brand: 'Acme Labs', accent: '#ff8800', base, image_url: 'https://evil.example/x.svg', file: 'data:image/svg+xml;base64,AAAA', base_extra: 1, ...{ base: 'https://evil.example/x.svg' } });
    // A team name is open only to the STAFF of the tenant whose row declares it. The sponsor becomes the instructor of
    // a throwaway test tenant that declares a name the word list refuses ("Verified ..."), posts under it, and the draft
    // is deleted. The learner, staff of nothing, is refused the same name.
    const teamBrand = `Verified E2E ${stamp}`.slice(0, 24);
    const tenant = (await sql(`insert into itera.tenants (slug, name, is_test, branding) values ('tera-e2e-${stamp}', 'tera-e2e-${stamp}', true, '${JSON.stringify({ sponsor_brand: teamBrand })}'::jsonb) returning id`))[0].id;
    await refused('a team name before the wallet is staff of that tenant', { brand: teamBrand, accent: '#16a34a', base });
    await sql(`insert into itera.memberships (user_id, tenant_id, role) select i.user_id, '${tenant}', 'instructor' from itera.identities i where i.provider_subject = '${sponsor.authUid}'`);
    const asStaff = await post(sponsor, form(stamp, 'team brand', { brand: teamBrand, accent: '#16a34a', base }));
    check('the staff of a tenant posts under the name its tenant row declares', asStaff.http === 200 && asStaff.j?.prize_tera?.brand === teamBrand, JSON.stringify(asStaff.j?.prize_tera ?? asStaff.j));
    const asOther = await post(learner, form(stamp, 'team brand', { brand: teamBrand, accent: '#16a34a', base }));
    check('the same name from a wallet that is not staff of it is refused', asOther.http === 400 && asOther.j?.error === 'invalid_prize_tera', JSON.stringify(asOther.j));
    const sentByClient = await post(learner, { ...form(stamp, 'team brand', { brand: teamBrand, accent: '#16a34a', base, own_brand: true, staff: true }), tenant_id: tenant, own_brands: [teamBrand], staff: true });
    check('and saying "I am staff" in the request changes nothing', sentByClient.http === 400 && sentByClient.j?.error === 'invalid_prize_tera');
    if (asStaff.j?.id) await post(sponsor, { action: 'delete', bounty: asStaff.j.id });
    await sql(`delete from itera.memberships where tenant_id = '${tenant}'; delete from itera.tenants where id = '${tenant}'`);

    const hostilePreview = await fetch(`${FUNCTIONS}/credential-meta/sponsor-preview.svg?brand=${encodeURIComponent('<script>x</script>')}&accent=%23ff8800&base=${base}`);
    check('the public preview refuses the same markup', hostilePreview.status === 400);

    // Control and direction characters are dropped, compatibility forms folded: what is stored is the clean name.
    const brand = `E2E Co ${stamp}`.slice(0, 24);
    const dirty = `‮${brand.slice(0, 3)}\u0000​${brand.slice(3)}⁦`;
    const created = await post(sponsor, form(stamp, 'prize', { brand: dirty, accent: '#FF8800', base, image_url: 'https://evil.example/x.svg' }));
    check('a bounty with a prize Tera is posted; control and direction characters never reach the stored brand', created.http === 200 && created.j?.prize_tera?.brand === brand && created.j.prize_tera.accent === '#ff8800' && created.j.prize_tera.total_lamports === PRIZE_TOTAL && !('image_url' in created.j.prize_tera), JSON.stringify(created.j?.prize_tera ?? created.j));
    const { id, slug } = created.j;
    await sql(`update itera.bounties set is_test = true where id = '${id}'`);

    const preview = await fetch(`${FUNCTIONS}/credential-meta/sponsor-preview.svg?brand=${encodeURIComponent(brand)}&accent=%23ff8800&base=${base}`);
    const previewSvg = await preview.text();
    check('the preview is the composed art: the brand as text, the base Tera inlined, no external reference', preview.status === 200 && previewSvg.includes(brand) && previewSvg.includes('data:image/') && !/https?:\/\/(?!www\.w3\.org)/.test(previewSvg) && !previewSvg.includes('<script'), `${previewSvg.length} bytes`);

    const blink = (await get(`bounty-action/${slug}?lang=en`)).j;
    check('the funding link says the prize, what part of the total is not escrow, and that a refund does not return it', typeof blink?.description === 'string' && blink.description.includes(`sponsor Tera ("${brand}")`) && blink.description.includes('0.014 SOL') && blink.description.includes('do not come back in a refund'), String(blink?.description).slice(-230));

    // ---- Funding: the sponsor pays the reward, the rent, the mint cost and the issuing fee, in one transaction ----
    const fund = await post(sponsor, { action: 'fund_tx', bounty: id });
    check('the funding quote names the Tera lines before anything is signed', fund.http === 200 && fund.j?.prize_tera?.total_lamports === PRIZE_TOTAL && fund.j.prize_tera.paid_to === treasury.address && fund.j.cost_lamports === REWARD + fund.j.rent_lamports + PRIZE_TOTAL, JSON.stringify({ cost: fund.j?.cost_lamports, rent: fund.j?.rent_lamports, prize: fund.j?.prize_tera }));
    const fundSignature = await send(sponsor, Buffer.from(fund.j.message_base64, 'base64'));
    const opened = await confirmUntil(sponsor, id, 'open');
    check('the bounty opens', opened.j?.status === 'open', fundSignature);
    const fundTransaction = await transaction(fundSignature);
    const treasuryIndex = fundTransaction.transaction.message.accountKeys.indexOf(treasury.address);
    check('ON CHAIN: that one transaction raised the treasury by the mint cost plus the fee', treasuryIndex >= 0 && fundTransaction.meta.postBalances[treasuryIndex] - fundTransaction.meta.preBalances[treasuryIndex] === PRIZE_TOTAL, explorer('tx', fundSignature));
    let view = await page(slug);
    check('the bounty shows its prize: funded, none issued yet, not transferable', view.prize_tera?.brand === brand && view.prize_tera.funded === true && view.prize_tera.issued === 0 && view.prize_tera.asset === null && view.prize_tera.transferable === false && view.prize_tera.image_url.includes('sponsor-preview.svg'), JSON.stringify(view.prize_tera));

    // ---- The learner works, the sponsor's wallet pays, the Tera is minted in that settlement ----------
    const accepted = await acceptBounty(learner, id);
    check('the certified learner accepts', accepted.http === 200, JSON.stringify(accepted.j).slice(0, 160));
    check('and delivers', (await call('bounty-claim', learner, { action: 'submit', bounty: id, url: 'https://example.com/tera-e2e' })).j?.submitted === true);
    const approve = await post(sponsor, { action: 'approve_tx', bounty: id });
    const payout = await send(sponsor, Buffer.from(approve.j.message_base64, 'base64'));
    const paidAt = Date.now();
    const paid = await confirmUntil(sponsor, id, 'paid');
    check('the sponsor\'s wallet pays the learner', paid.j?.status === 'paid' && paid.j.payout_signature === payout, explorer('tx', payout));
    for (let attempt = 0; attempt < 15; attempt += 1) {
      view = await page(slug);
      if (view.prize_tera?.asset) break;
      await sleep(2000);
    }
    const asset = view.prize_tera?.asset;
    check('the settlement that recorded the payout minted the prize Tera', Boolean(asset) && view.prize_tera.issued === 1 && view.prize_tera.page_url.endsWith(`/c/${asset}`), `${asset} ${Date.now() - paidAt} ms after the payout`);
    const verified = (await get(`credential-verify/${asset}?fresh=1`)).j;
    const attributes = new Map((verified?.attributes ?? []).map(({ key, value }) => [key, value]));
    check('ON CHAIN: the sponsor Tera is ours, FROZEN, and owned by the wallet the escrow paid', verified?.verified === true && verified.frozen === true && verified.owner === learner.address, explorer('address', asset));
    check('ON CHAIN: it names its origin, the brand, the bounty and the payout transaction', attributes.get('origin') === 'sponsor' && attributes.get('brand') === brand && attributes.get('accent') === '#ff8800' && attributes.get('key') === base && attributes.get('bounty') === id && attributes.get('payout_tx') === payout && attributes.get('learner') === learner.address && attributes.get('serial') === '1' && attributes.get('supply_cap') === '1', JSON.stringify(Object.fromEntries(attributes)));
    check('credential-verify says sponsored, not transferable, with the bounty', verified.avatar?.origin === 'sponsor' && verified.avatar.transferable === false && verified.avatar.sponsor?.bounty_slug === slug && verified.avatar.sponsor.payout_tx === payout && verified.avatar.proof?.asset === asset);
    await call('privacy', learner, { action: 'set_profile', public: true });
    const profile = (await get(`learner-profile/${learner.address}?fresh=1`)).j;
    const listed = (profile?.avatars ?? []).find((entry) => entry.asset === asset);
    check('learner-profile lists it as a sponsor Tera, apart from earned and bought ones', listed?.origin === 'sponsor' && listed.transferable === false && listed.verified === true && listed.sponsor?.brand === brand && listed.sponsor.bounty_slug === slug && listed.rarity === 'sponsor');
    const metadata = await (await fetch(verified.uri)).json();
    const art = await (await fetch(metadata.image)).text();
    check('its metadata and art are served by us: the brand, the edition, no upload', metadata.name.includes(brand) && metadata.attributes.some((entry) => entry.trait_type === 'Origin' && entry.value === 'sponsor') && art.includes(brand) && art.includes('#1 OF 1') && !art.includes('evil.example'));
    report.sponsor = { bounty: slug, asset, payout, fund: fundSignature, brand, mint_after_payout_ms: Date.now() - paidAt };

    // ---- Replay: one payout, one Tera -----------------------------------------------------------------
    const again = await post(sponsor, { action: 'confirm', bounty: id });
    await page(slug);
    await sleep(1500);
    const rows = await sql(`select count(*)::int n, count(distinct asset_address)::int assets from itera.sponsor_teras where bounty_id = '${id}'`);
    check('confirming and reading again mints nothing more', again.j?.status === 'paid' && rows[0].n === 1 && rows[0].assets === 1 && (await page(slug)).prize_tera.asset === asset);

    // ---- What the escrow program does NOT check: a funding that skips the Tera lines --------------------
    const second = await post(sponsor, form(stamp, 'unpaid prize', { brand, accent: '#3355ff', base }));
    await sql(`update itera.bounties set is_test = true where id = '${second.j.id}'`);
    const secondFund = await post(sponsor, { action: 'fund_tx', bounty: second.j.id });
    const decoded = decodeMessage(Uint8Array.from(Buffer.from(secondFund.j.message_base64, 'base64')));
    const withoutFee = decoded.instructions.filter((instruction) => !(instruction.programId === SYSTEM_PROGRAM && instruction.accounts.some((account) => account.address === treasury.address)));
    check('the server\'s funding transaction carries the transfer to the treasury', withoutFee.length === decoded.instructions.length - 1);
    await send(sponsor, compileMessage(sponsor.address, withoutFee, await latestBlockhash()));
    const cheap = await confirmUntil(sponsor, second.j.id, 'open');
    const cheapView = await page(second.j.slug);
    check('a funding that drops that transfer still opens the bounty (the program only knows the reward)', cheap.j?.status === 'open');
    check('but its prize is shown as NOT funded, and no Tera will be minted for it', cheapView.prize_tera?.funded === false && cheapView.prize_tera.issued === 0, JSON.stringify(cheapView.prize_tera));
    const refund = await post(sponsor, { action: 'refund_tx', bounty: second.j.id });
    if (refund.http === 200) {
      await send(sponsor, Buffer.from(refund.j.message_base64, 'base64'));
      await confirmUntil(sponsor, second.j.id, 'refunded');
    }

    // The sponsor returns what it did not spend.
    const left = await balance(sponsor.address);
    if (left > 2_000_000) await send(sponsor, buildTransferMessage({ payer: sponsor.address, recipient: treasury.address, lamports: BigInt(left - 1_000_000), memo: 'tera-e2e: sponsor returns the rest', recentBlockhash: await latestBlockhash() }));
  }
}
