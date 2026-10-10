import { GLOBAL_REF } from '../_shared/awards.ts';
import { callerFailureStatus, resolveCaller, type Caller } from '../_shared/caller.ts';
import { companionResponse, ensureCompanion, inBackground, livesOf, loadInventory, loadStats, syncMirror } from '../_shared/companion-store.ts';
import { cosmeticsOf } from '../_shared/cosmetics.ts';
import { chainBlock, pickText } from '../_shared/credential.ts';
import { loadAvatarCatalog } from '../_shared/avatar-store.ts';
import { includedWithMap } from '../_shared/avatars.ts';
import { CRYSTAL_HANDLERS } from '../_shared/crystals-items.ts';
import { crystalMetadataUrl, mirrorCrystals, tokenView } from '../_shared/crystals-mirror.ts';
import {
  grantCrystals,
  loadAccount,
  loadCrystalItem,
  loadCrystalItems,
  loadCrystalPurchase,
  loadLedger,
  loadTheme,
  ownedThemeKeys,
  saveThemeChoice,
  spendCrystals,
  type CrystalItem,
} from '../_shared/crystals-store.ts';
import { CRYSTAL_MINT_CONFIG_KEY, CRYSTAL_NAME, CRYSTAL_SYMBOL } from '../_shared/crystals-token.ts';
import {
  LIFE_KEY,
  THEME_KINDS,
  THEME_SLOTS,
  earnRulesView,
  equipRequest,
  borderOf,
  equipVerdict,
  isThemeDefault,
  isThemeEntry,
  lifePurchase,
  lifeQty,
  priceOf,
  pricesOf,
  spendRef,
  themeColor,
  type ThemeSlot,
} from '../_shared/crystals.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, langOf, pathAfter, readJsonObject } from '../_shared/http.ts';
import { applyLifePack, lifePackOf, refillLives, regenerate } from '../_shared/lives.ts';
import { ApplyRefusal, purchasedAvatarView, type ApplyOutcome } from '../_shared/shop-items.ts';
import type { IneligibleCode } from '../_shared/shop-rules.ts';

type Lang = 'pt' | 'en';
type Answer = { status: number; body: Record<string, unknown> };

const SPEND_ATTEMPTS = 5;
const INELIGIBLE_STATUS: Partial<Record<IneligibleCode, number>> = { invalid_ref: 400 };
const TOKEN_ART =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#0A0908"/>' +
  '<path d="M128 28 196 108 128 228 60 108Z" fill="#F5B301"/><path d="M128 28 160 108 128 228 96 108Z" fill="#FF6B5E"/>' +
  '<path d="M60 108H196" stroke="#0A0908" stroke-width="6"/></svg>';

/** Everything the crystals sheet shows. Starts the token mirror when the chain is behind. */
async function overview(db: IteraClient, caller: Caller, lang: Lang): Promise<Record<string, unknown>> {
  const userId = caller.iteraUserId;
  const [account, ledger, items, config, includedWith] = await Promise.all([
    loadAccount(db, userId),
    loadLedger(db, userId),
    loadCrystalItems(db),
    loadConfig(db),
    // Which avatar a border comes with. Never fatal for the sheet.
    loadAvatarCatalog(db).then(includedWithMap, () => new Map<string, string>()),
  ]);
  const owned = await ownedThemeKeys(db, userId, items);
  const theme = await loadTheme(db, userId, items, owned, lang);
  const token = tokenView(account, config[CRYSTAL_MINT_CONFIG_KEY] ?? null, caller.wallet);
  if (caller.wallet && !token.mirrored) inBackground(mirrorCrystals(db, userId, caller.wallet));

  const slotOf = (kind: string) => (Object.keys(THEME_SLOTS) as ThemeSlot[]).find((slot) => THEME_SLOTS[slot] === kind) as ThemeSlot;
  return {
    balance: account.balance,
    ...token,
    prices: pricesOf(items),
    earn_rules: earnRulesView(lang),
    ledger,
    theme,
    theme_items: items
      .filter((item) => THEME_KINDS.includes(item.kind) && isThemeEntry(item))
      .map((item) => ({
        key: item.key,
        slot: slotOf(item.kind),
        ...(item.kind === THEME_SLOTS.border ? { border: borderOf(item) } : { color: themeColor(item) }),
        title: pickText(item.title_i18n, lang),
        description: pickText(item.description_i18n, lang),
        price_crystals: priceOf(item),
        for_sale: !isThemeDefault(item) && (priceOf(item) !== null || item.price_lamports != null),
        included_with: includedWith.get(item.key) ?? null,
        default: isThemeDefault(item),
        owned: isThemeDefault(item) || owned.has(item.key),
        equipped: theme[slotOf(item.kind)].key === item.key,
      })),
  };
}

const insufficient = (balance: number, price: number): Answer => ({ status: 402, body: { error: 'insufficient_crystals', balance, price } });

/** Lives are written in the same transaction as the debit; the asset follows after the response. */
async function livesAnswer(db: IteraClient, caller: Caller, balance: number, item: Record<string, unknown>): Promise<Answer> {
  const userId = caller.iteraUserId;
  if (caller.wallet) {
    inBackground(syncMirror(db, userId, 0, 'purchase'));
    inBackground(mirrorCrystals(db, userId, caller.wallet));
  }
  const now = new Date();
  const [companion, stats] = await Promise.all([ensureCompanion(db, userId), loadStats(db, userId, now)]);
  return { status: 200, body: { balance, item, ...companionResponse(companion, stats, now) } };
}

/** `item_key: "life"`: one life each, up to the maximum. Only the lives that fit are sold. */
async function spendOnLives(db: IteraClient, caller: Caller, qty: number): Promise<Answer> {
  const userId = caller.iteraUserId;
  const ref = spendRef(LIFE_KEY, GLOBAL_REF, true, crypto.randomUUID());
  for (let attempt = 0; attempt < SPEND_ATTEMPTS; attempt += 1) {
    const [row, account] = await Promise.all([ensureCompanion(db, userId), loadAccount(db, userId)]);
    const current = regenerate({ lives: row.lives, maxLives: row.max_lives, lastRegenAt: row.last_regen_at }, new Date());
    const plan = lifePurchase({ lives: current.lives, maxLives: current.maxLives, qty });
    if (plan === 'not_needed') return { status: 409, body: { error: 'not_needed' } };
    if (account.balance < plan.price) return insufficient(account.balance, plan.price);
    const spent = await spendCrystals(db, {
      userId,
      amount: plan.price,
      ref,
      lives: { version: row.version, lives: current.lives + plan.added, last_regen_at: current.lastRegenAt },
    });
    if (spent.status === 'insufficient') return insufficient(spent.balance, plan.price);
    if (spent.status === 'ok') return livesAnswer(db, caller, spent.balance, { key: LIFE_KEY, kind: 'life', qty: plan.added, price: plan.price });
    // `conflict`: the companion changed under us (a lost life, a regeneration written): read again.
  }
  throw new Error('crystals: too many concurrent updates of the companion');
}

/** The full refill or a life pack, same rules as the paid ones, with the lives written inside the debit. */
async function spendOnRefill(db: IteraClient, caller: Caller, item: CrystalItem, price: number, lang: Lang): Promise<Answer> {
  const userId = caller.iteraUserId;
  const ref = spendRef(item.key, GLOBAL_REF, true, crypto.randomUUID());
  for (let attempt = 0; attempt < SPEND_ATTEMPTS; attempt += 1) {
    const verdict = await CRYSTAL_HANDLERS.life!.canBuy({ db, userId, item, refId: GLOBAL_REF });
    if (!verdict.ok) return { status: INELIGIBLE_STATUS[verdict.error] ?? 409, body: { error: verdict.error } };
    const [row, account] = await Promise.all([ensureCompanion(db, userId), loadAccount(db, userId)]);
    if (account.balance < price) return insufficient(account.balance, price);
    const now = new Date();
    const pack = lifePackOf(item.effect);
    const next = pack ? applyLifePack(livesOf(row), pack, now) : refillLives(livesOf(row), now);
    const spent = await spendCrystals(db, {
      userId,
      amount: price,
      ref,
      purchase: { item_key: item.key, ref_id: GLOBAL_REF, wallet: caller.wallet ?? '' },
      lives: { version: row.version, lives: next.lives, last_regen_at: next.lastRegenAt, ...(pack && next.unlimitedUntil ? { unlimited_until: next.unlimitedUntil } : {}) },
    });
    if (spent.status === 'insufficient') return insufficient(spent.balance, price);
    if (spent.status === 'ok') return livesAnswer(db, caller, spent.balance, { key: item.key, kind: item.kind, title: pickText(item.title_i18n, lang), price });
  }
  throw new Error('crystals: too many concurrent updates of the companion');
}

/**
 * Something owned once (outfit, ink, frame, background, icon colour). The debit
 * and the paid `purchases` row are one transaction, keyed by what is bought:
 * two requests for the same thing are one debit, and a purchase whose effect
 * failed is found again and completed by the next request, at no further cost.
 */
async function spendOnItem(db: IteraClient, caller: Caller, item: CrystalItem, price: number, refId: string, lang: Lang): Promise<Answer> {
  const userId = caller.iteraUserId;
  const handler = CRYSTAL_HANDLERS[item.kind];
  if (!handler) return { status: 400, body: { error: 'not_for_crystals' } };
  const context = { db, userId, item, refId };
  const ref = spendRef(item.key, refId, false, '');
  // The collectible is minted to a wallet: a learner without one is told before anything is charged.
  if (item.kind === 'avatar' && !caller.wallet) return { status: 403, body: { error: 'no_wallet' } };

  let purchase = await loadCrystalPurchase(db, userId, ref);
  if (!purchase || purchase.applied_at) {
    const verdict = await handler.canBuy(context);
    if (!verdict.ok) return { status: INELIGIBLE_STATUS[verdict.error] ?? 409, body: { error: verdict.error } };
  }
  if (!purchase) {
    // No balance check out here: the database looks for this key before the balance, so the request
    // that lost a race for the same item is told `duplicate`, not that it cannot pay.
    const spent = await spendCrystals(db, { userId, amount: price, ref, purchase: { item_key: item.key, ref_id: refId, wallet: caller.wallet ?? '' } });
    if (spent.status === 'insufficient') return insufficient(spent.balance, price);
    purchase = await loadCrystalPurchase(db, userId, ref);
    if (!purchase) throw new Error('crystals: the purchase row is missing after the debit');
  }

  let outcome: ApplyOutcome;
  try {
    outcome = await handler.apply({ ...context, purchase });
    const { error } = await db.from('purchases').update({ applied_at: new Date().toISOString(), error: null }).eq('id', purchase.id);
    if (error) throw new Error(`purchases applied: ${error.message}`);
  } catch (error) {
    if (error instanceof ApplyRefusal) {
      // Paid, but the last unit went to somebody else (or the learner already holds it): the crystals come back at once.
      const { balance } = await grantCrystals(db, userId, price, 'refund', purchase.id);
      await db.from('purchases').update({ status: 'refunded', refunded_at: new Date().toISOString(), error: error.code }).eq('id', purchase.id);
      return { status: 409, body: { error: error.code === 'sold_out_after_payment' ? 'sold_out' : 'already_owned', refunded: true, balance } };
    }
    console.error(`crystal purchase ${purchase.id} effect failed`, error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 300);
    await db.from('purchases').update({ error: message, applied_at: null }).eq('id', purchase.id);
    return { status: 502, body: { error: 'apply_failed', retryable: true, balance: (await loadAccount(db, userId)).balance } };
  }

  if (caller.wallet) inBackground(mirrorCrystals(db, userId, caller.wallet));
  const now = new Date();
  const body: Record<string, unknown> = {
    balance: (await loadAccount(db, userId)).balance,
    item: { key: item.key, kind: item.kind, title: pickText(item.title_i18n, lang), price },
  };
  if (outcome.companion) {
    const [companion, stats] = await Promise.all([ensureCompanion(db, userId), loadStats(db, userId, now)]);
    Object.assign(body, companionResponse(companion, stats, now), { inventory: await loadInventory(db, userId, companion.outfit) });
  }
  if (outcome.passport) Object.assign(body, { ref_id: refId, cosmetics: cosmeticsOf(outcome.passport.state) });
  if (outcome.chain) body.chain = chainBlock(outcome.chain);
  if (outcome.avatar) body.avatar = purchasedAvatarView(outcome.avatar, lang);
  if (THEME_KINDS.includes(item.kind)) body.theme = await loadTheme(db, userId, await loadCrystalItems(db), undefined, lang);
  return { status: 200, body };
}

async function spend(db: IteraClient, caller: Caller, body: Record<string, unknown>): Promise<Answer> {
  const { item_key: itemKey, ref_id: refId = GLOBAL_REF } = body;
  const qty = lifeQty(body.qty);
  const lang: Lang = body.lang === 'en' ? 'en' : 'pt';
  if (typeof itemKey !== 'string' || itemKey.length === 0 || itemKey.length > 64 || typeof refId !== 'string' || !isUuid(refId) || qty === null) {
    return { status: 400, body: { error: 'invalid_body' } };
  }
  if (itemKey === LIFE_KEY) return spendOnLives(db, caller, qty);

  const item = await loadCrystalItem(db, itemKey);
  if (!item) return { status: 404, body: { error: 'item_not_found' } };
  if (!item.active) return { status: 409, body: { error: 'item_inactive' } };
  const price = priceOf(item);
  if (price === null || !CRYSTAL_HANDLERS[item.kind]) return { status: 400, body: { error: 'not_for_crystals' } };
  if (item.kind === 'life') return spendOnRefill(db, caller, item, price, lang);
  return spendOnItem(db, caller, item, price, refId.toLowerCase(), lang);
}

/** Wears a background, an icon colour or a border the learner owns (the defaults are everybody's). */
async function equip(db: IteraClient, caller: Caller, body: Record<string, unknown>): Promise<Answer> {
  const lang: Lang = body.lang === 'en' ? 'en' : 'pt';
  const wanted = equipRequest(body);
  if (!wanted) return { status: 400, body: { error: 'invalid_body' } };
  const items = await loadCrystalItems(db);
  const owned = await ownedThemeKeys(db, caller.iteraUserId, items);
  for (const slot of Object.keys(wanted) as ThemeSlot[]) {
    const verdict = equipVerdict(slot, items.find((item) => item.key === wanted[slot]), owned);
    if (verdict === 'unknown_item') return { status: 404, body: { error: 'item_not_found', slot } };
    if (verdict === 'not_owned') return { status: 409, body: { error: 'not_owned', slot } };
  }
  await saveThemeChoice(db, caller.iteraUserId, wanted);
  return { status: 200, body: { theme: await loadTheme(db, caller.iteraUserId, items, owned, lang) } };
}

Deno.serve(async (request) => {
  const route = pathAfter(request, 'crystals').join('/');

  // What wallets and explorers read about the token: public, no session.
  if (request.method === 'GET' && (route === 'token.json' || route === 'token.svg')) {
    const open = { ...corsHeaders(request, 'public'), 'Cache-Control': 'public, max-age=3600' };
    if (route === 'token.svg') return new Response(TOKEN_ART, { status: 200, headers: { ...open, 'Content-Type': 'image/svg+xml' } });
    const description = 'A fênix renasce. Cristais devolvem vidas. Earned by learning on Itera; not transferable, never sold.';
    return json({ name: CRYSTAL_NAME, symbol: CRYSTAL_SYMBOL, description, image: `${functionsBase()}/crystals/token.svg`, external_url: crystalMetadataUrl() }, 200, open);
  }

  const cors = corsHeaders(request, 'app', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const isRead = request.method === 'GET' && route === '';
  const isWrite = request.method === 'POST' && (route === 'spend' || route === 'equip');
  if (!isRead && !isWrite) {
    const known = route === '' || route === 'spend' || route === 'equip';
    return json({ error: known ? 'method_not_allowed' : 'not_found' }, known ? 405 : 404, cors);
  }

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    if (isRead) return json(await overview(db, caller, langOf(request, 'pt')), 200, { ...cors, 'Cache-Control': 'private, no-store' });

    const body = await readJsonObject(request);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    const answer = route === 'spend' ? await spend(db, caller, body) : await equip(db, caller, body);
    return json(answer.body, answer.status, cors);
  } catch (error) {
    console.error('crystals failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
