import { describe, expect, it } from 'vitest';
import { renderArt } from './art';
import {
  DEFAULT_AVATAR_KEY,
  MAX_OPEN_RESERVATIONS,
  allowsOutfit,
  avatarAssetName,
  avatarAttributes,
  avatarFromAttributes,
  avatarImageUrl,
  avatarMetadata,
  avatarView,
  equipVerdict,
  isSoldOut,
  lowestFreeSerial,
  reservationUntil,
  reserveAvatar,
  resolveAvatar,
  shopAvatarFields,
  type AvatarAssetRow,
  type AvatarCatalog,
  type AvatarItem,
  type ReservationStore,
} from './avatars';
import { loreOf } from './lore';
import { companionArtInput, companionAttributes, companionChainImageUrl, companionFromAttributes, type CompanionSnapshot } from './companion';
import { profileAvatars, isCollectibleVerified } from './profile';
import { eligibility } from './shop-rules';
import { GLOBAL_REF } from './awards';

const SUPABASE = 'https://example.supabase.co';
const item = (key: string, patch: Partial<AvatarItem> = {}): AvatarItem => ({
  key,
  title_i18n: { pt: 'Líder', en: 'Leader' },
  description_i18n: { pt: 'd', en: 'd' },
  price_lamports: 5_500_000,
  price_usd_cents: 100,
  price_label: 'US$ 1.00 ≈ 0.0055 SOL',
  rarity: 'rare',
  avatar_group: 'base',
  supply_cap: 500,
  image_key: key,
  active: true,
  sort: 1,
  ...patch,
});
const FREE = item(DEFAULT_AVATAR_KEY, { title_i18n: { pt: 'Normal', en: 'Normal' }, price_lamports: null, price_usd_cents: 0, price_label: 'Free', rarity: 'common', avatar_group: 'expression', supply_cap: null });
const HAPPY = item('tera_feliz', { ...FREE, key: 'tera_feliz', image_key: 'tera_feliz', title_i18n: { pt: 'Feliz', en: 'Happy' } });
const LEADER = item('base_lider');
const NO_LORE = item('base_sem_lore', { title_i18n: { pt: 'Sem lore', en: 'No lore' } });
const MYTHIC = item('event_space', { title_i18n: { pt: 'Space', en: 'Space' }, rarity: 'mythic', avatar_group: 'event', supply_cap: 5, price_lamports: 5_500_000_000, price_usd_cents: 100_000, price_label: 'US$ 1,000.00 ≈ 5.5 SOL' });
const catalog: AvatarCatalog = {
  items: new Map([FREE, HAPPY, LEADER, MYTHIC].map((entry) => [entry.key, entry])),
  tiers: new Map([
    ['common', { rarity: 'common', rank: 1, tier_name_i18n: { pt: 'Tera', en: 'Tera' }, label_i18n: { pt: 'Comum', en: 'Common' } }],
    ['rare', { rarity: 'rare', rank: 2, tier_name_i18n: { pt: 'Super Tera', en: 'Super Tera' }, label_i18n: { pt: 'Raro', en: 'Rare' } }],
    ['mythic', { rarity: 'mythic', rank: 5, tier_name_i18n: { pt: 'Tera Mítico', en: 'Mythic Tera' }, label_i18n: { pt: 'Impossível', en: 'Impossible' } }],
  ]),
};

/** An in-memory `avatar_assets` with the table's two unique indexes. `beforeInsert` lets a test interleave another buyer. */
function memoryStore(rows: AvatarAssetRow[] = [], caps: Record<string, number | null> = {}) {
  let next = 1;
  const hooks: { beforeInsert?: () => Promise<void> } = {};
  const store: ReservationStore = {
    async dropExpired(itemKey, now) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (row.item_key === itemKey && row.mint_status === 'reserved' && row.reserved_until !== null && Date.parse(row.reserved_until) <= now.getTime()) rows.splice(index, 1);
      }
    },
    async findOwn(userId, itemKey) {
      return rows.find((row) => row.user_id === userId && row.item_key === itemKey) ?? null;
    },
    async takenSerials(itemKey) {
      return rows.filter((row) => row.item_key === itemKey).map((row) => row.serial);
    },
    async openHolds(userId, now) {
      return rows.filter((row) => row.user_id === userId && row.mint_status === 'reserved' && row.reserved_until !== null && Date.parse(row.reserved_until) > now.getTime() && caps[row.item_key] != null).length;
    },
    async insert(row) {
      const hook = hooks.beforeInsert;
      hooks.beforeInsert = undefined;
      await hook?.();
      if (rows.some((other) => other.item_key === row.item_key && (other.serial === row.serial || other.user_id === row.user_id))) return null;
      const created: AvatarAssetRow = { id: `row-${next++}`, wallet: null, asset_address: null, tx_signature: null, minted_at: null, ...row };
      rows.push(created);
      return created;
    },
    async keep(id, patch) {
      const row = rows.find((entry) => entry.id === id && entry.mint_status === 'reserved');
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
  };
  return { store, rows, hooks };
}

const NOW = new Date('2026-10-10T12:00:00.000Z');
const UNTIL = new Date('2026-10-10T12:03:00.000Z');
const ask = (userId: string, target: AvatarItem, paid = false, now = NOW) => ({ userId, item: target, purchaseId: `intent-${userId}`, paid, until: new Date(now.getTime() + 180_000), now });

describe('lore in names, metadata and views', () => {
  it('composes the metadata with lore: English story, transferable line, Epithet and Quote', () => {
    const lore = loreOf('base_lider');
    const meta = avatarMetadata(catalog, LEADER, { serial: 7, asset_address: 'Asset111' }, 'pt', SUPABASE);
    expect(meta.name).toBe('Dom · Super Tera #7');
    expect(meta.description.startsWith(lore?.story.en as string)).toBe(true);
    expect(meta.description).toMatch(/NOT soulbound/);
    expect(meta.attributes).toContainEqual({ trait_type: 'Epithet', value: 'Crown of no one' });
    expect(meta.attributes).toContainEqual({ trait_type: 'Quote', value: lore?.quote.en });
    expect(meta.attributes).toContainEqual({ trait_type: 'Transferable', value: 'yes' });
  });

  it('keeps today\'s metadata when the avatar has no lore', () => {
    const meta = avatarMetadata(catalog, NO_LORE, { serial: 2, asset_address: null }, 'en', SUPABASE);
    expect(meta.name).toBe('Super Tera · No lore #2');
    expect(meta.description).toBe(avatarMetadata(catalog, NO_LORE, { serial: 2, asset_address: null }, 'en', SUPABASE).description);
    expect(meta.description).toMatch(/^A collectible avatar of Tera/);
    expect(meta.attributes.map((a) => a.trait_type)).not.toContain('Epithet');
    expect(avatarMetadata(catalog, NO_LORE, { serial: 2, asset_address: null }, 'pt', SUPABASE).name).toBe('Super Tera · Sem lore #2');
  });

  it('puts a resolved lore block in the shop entry, the avatar view and the profile list, null without lore', () => {
    const facts = { supply: undefined, own: null, equippedKey: null };
    expect(shopAvatarFields(catalog, LEADER, 'pt', SUPABASE, facts).lore).toMatchObject({ name: 'Dom', epithet: 'Coroa de ninguém' });
    expect(shopAvatarFields(catalog, LEADER, 'en', SUPABASE, facts).lore?.epithet).toBe('Crown of no one');
    expect(shopAvatarFields(catalog, NO_LORE, 'pt', SUPABASE, facts).lore).toBeNull();
    expect(avatarView(catalog, LEADER, 'en', SUPABASE, null).lore?.name).toBe('Dom');
    expect(avatarView(catalog, NO_LORE, 'en', SUPABASE, null).lore).toBeNull();
  });

  it('derives chip_url beside image_url and thumb_url', () => {
    const chip = `${SUPABASE}/storage/v1/object/public/tera-avatars/base_lider_chip.webp`;
    expect(avatarImageUrl(SUPABASE, LEADER, 'chip')).toBe(chip);
    expect(avatarView(catalog, LEADER, 'en', SUPABASE, null).chip_url).toBe(chip);
    expect(shopAvatarFields(catalog, LEADER, 'en', SUPABASE, { supply: undefined, own: null, equippedKey: null }).chip_url).toBe(chip);
  });
});

describe('catalog and tiers', () => {
  it('derives the public URLs from the key alone', () => {
    expect(avatarImageUrl(SUPABASE, LEADER)).toBe(`${SUPABASE}/storage/v1/object/public/tera-avatars/base_lider.webp`);
    expect(avatarImageUrl(SUPABASE, LEADER, '128')).toBe(`${SUPABASE}/storage/v1/object/public/tera-avatars/base_lider_128.webp`);
    expect(avatarImageUrl(SUPABASE, { key: 'x', image_key: null }, 'png')).toBe(`${SUPABASE}/storage/v1/object/public/tera-avatars/x.png`);
  });

  it('names the asset with tier, title and serial', () => {
    expect(avatarAssetName(catalog, LEADER, 7)).toBe('Dom · Super Tera #7');
    expect(avatarAssetName(catalog, NO_LORE, 7)).toBe('Super Tera · Sem lore #7');
    expect(avatarAttributes(catalog, MYTHIC, 3)).toEqual([
      { key: 'kind', value: 'avatar' },
      { key: 'key', value: 'event_space' },
      { key: 'rarity', value: 'mythic' },
      { key: 'tier', value: 'Mythic Tera' },
      { key: 'serial', value: '3' },
      { key: 'supply_cap', value: '5' },
    ]);
    expect(avatarAttributes(catalog, item('base_iniciante', { supply_cap: null }), 1).at(-1)).toEqual({ key: 'supply_cap', value: 'open' });
  });

  it('reads an avatar back from its attributes and ignores other assets', () => {
    expect(avatarFromAttributes(avatarAttributes(catalog, MYTHIC, 3))).toEqual({ key: 'event_space', rarity: 'mythic', tier_name: 'Mythic Tera', serial: 3, supply_cap: 5 });
    expect(avatarFromAttributes(avatarAttributes(catalog, item('base_iniciante', { supply_cap: null }), 2))?.supply_cap).toBeNull();
    expect(avatarFromAttributes([{ key: 'kind', value: 'companion' }])).toBeNull();
    expect(avatarFromAttributes([{ key: 'kind', value: 'avatar' }, { key: 'key', value: '"><script>' }])).toBeNull();
  });

  it('says in the metadata that a collectible is transferable, and carries no owner', () => {
    const meta = avatarMetadata(catalog, LEADER, { serial: 7, asset_address: 'Asset111' }, 'en', SUPABASE);
    expect(meta.name).toBe('Dom · Super Tera #7');
    expect(meta.description).toMatch(/NOT soulbound/);
    expect(meta.image).toBe(`${SUPABASE}/storage/v1/object/public/tera-avatars/base_lider.webp`);
    expect(meta.attributes).toContainEqual({ trait_type: 'Transferable', value: 'yes' });
    expect(JSON.stringify(meta)).not.toMatch(/user|wallet|learner/i);
  });

  it('lists a free avatar as owned by everyone and a paid one with its price and supply', () => {
    const free = shopAvatarFields(catalog, HAPPY, 'pt', SUPABASE, { supply: undefined, own: null, equippedKey: null });
    expect(free).toMatchObject({ kind: 'avatar', free: true, owned: true, equipped: false, sold_out: false, price_lamports: 0, price_usd_cents: 0, price_label: 'Grátis', group: 'expression', allows_outfit: true, supply: { minted: 0, max: null }, asset_address: null });
    const paid = shopAvatarFields(catalog, MYTHIC, 'pt', SUPABASE, { supply: { minted: 2, held: 3 }, own: null, equippedKey: 'tera_feliz' });
    expect(paid).toMatchObject({ free: false, owned: false, sold_out: false, price_lamports: 5_500_000_000, price_label: 'US$ 1,000.00 ≈ 5.5 SOL', rarity: 'mythic', rarity_label: 'Impossível', tier_name: 'Tera Mítico', allows_outfit: false, supply: { minted: 2, max: 5 } });
  });

  it('carries the season of a seasonal avatar and null for the others', () => {
    const season = { key: 'natal', from: '12-01', to: '12-31', label: { pt: 'Natal', en: 'Christmas' } };
    const seasonal = item('event_natal', { effect: { season } });
    const base = { supply: undefined, own: null, equippedKey: null };
    expect(shopAvatarFields(catalog, seasonal, 'en', SUPABASE, { ...base, now: new Date('2026-10-10T00:00:00Z') }).season).toEqual({
      key: 'natal',
      label: 'Christmas',
      starts_at: '2026-12-01T00:00:00.000Z',
      ends_at: '2026-12-31T23:59:59.999Z',
      available: false,
    });
    expect(shopAvatarFields(catalog, seasonal, 'pt', SUPABASE, { ...base, now: new Date('2026-12-24T00:00:00Z') }).season).toMatchObject({ label: 'Natal', available: true });
    expect(shopAvatarFields(catalog, LEADER, 'pt', SUPABASE, base).season).toBeNull();
  });

  it('is sold out when every unit is paid or held, except for the learner holding one', () => {
    expect(isSoldOut(MYTHIC, { minted: 4, held: 5 })).toBe(true);
    expect(isSoldOut(MYTHIC, { minted: 4, held: 4 })).toBe(false);
    expect(isSoldOut(item('open', { supply_cap: null }), { minted: 9999, held: 9999 })).toBe(false);
    const facts = { supply: { minted: 4, held: 5 }, equippedKey: null };
    expect(shopAvatarFields(catalog, MYTHIC, 'en', SUPABASE, { ...facts, own: null }).sold_out).toBe(true);
    const holding: AvatarAssetRow = { id: 'r', user_id: 'u', item_key: MYTHIC.key, serial: 5, purchase_id: 'p', mint_status: 'reserved', reserved_until: new Date(Date.now() + 60_000).toISOString(), wallet: null, asset_address: null, tx_signature: null, minted_at: null };
    expect(shopAvatarFields(catalog, MYTHIC, 'en', SUPABASE, { ...facts, own: holding })).toMatchObject({ sold_out: false, owned: false });
    expect(shopAvatarFields(catalog, MYTHIC, 'en', SUPABASE, { ...facts, own: { ...holding, mint_status: 'minted', asset_address: 'Asset111' } })).toMatchObject({ sold_out: false, owned: true, asset_address: 'Asset111' });
  });
});

describe('eligibility and equip', () => {
  const facts = { refId: GLOBAL_REF, lives: 0, maxLives: 0, owned: false, passportMinted: false };

  it('refuses a free avatar, an owned one and a sold-out one, in that order', () => {
    expect(eligibility('avatar', { ...facts, free: true, owned: true, soldOut: true })).toEqual({ ok: false, error: 'free_item' });
    expect(eligibility('avatar', { ...facts, owned: true, soldOut: true })).toEqual({ ok: false, error: 'already_owned' });
    expect(eligibility('avatar', { ...facts, soldOut: true })).toEqual({ ok: false, error: 'sold_out' });
    expect(eligibility('avatar', facts)).toEqual({ ok: true });
    expect(eligibility('avatar', { ...facts, refId: '11111111-1111-4111-8111-111111111111' })).toEqual({ ok: false, error: 'invalid_ref' });
  });

  it('lets anyone wear a free avatar and only the owner wear a collectible', () => {
    expect(equipVerdict(HAPPY, new Set())).toEqual({ ok: true });
    expect(equipVerdict(LEADER, new Set())).toEqual({ ok: false, error: 'not_owned' });
    expect(equipVerdict(LEADER, new Set(['base_lider']))).toEqual({ ok: true });
    expect(equipVerdict(undefined, new Set(['x']))).toEqual({ ok: false, error: 'unknown_avatar' });
    expect(equipVerdict({ ...LEADER, active: false }, new Set(['base_lider']))).toEqual({ ok: false, error: 'unknown_avatar' });
  });

  it('always resolves to an avatar: the stored one, else the default', () => {
    expect(resolveAvatar(catalog, 'base_lider')?.key).toBe('base_lider');
    expect(resolveAvatar(catalog, 'gone')?.key).toBe(DEFAULT_AVATAR_KEY);
    expect(resolveAvatar(catalog, null)?.key).toBe(DEFAULT_AVATAR_KEY);
    expect(avatarView(catalog, FREE, 'pt', SUPABASE, null)).toMatchObject({ key: 'tera_normal', title: 'Normal', rarity: 'common', tier_name: 'Tera', asset_address: null, allows_outfit: true });
  });
});

describe('serial and supply', () => {
  it('hands out the lowest free serial and never one above the cap', () => {
    expect(lowestFreeSerial([], 5)).toBe(1);
    expect(lowestFreeSerial([1, 2, 4], 5)).toBe(3);
    expect(lowestFreeSerial([1, 2, 3, 4, 5], 5)).toBeNull();
    expect(lowestFreeSerial([1, 2, 3], null)).toBe(4);
  });

  it('numbers buyers in order and reports the cap', async () => {
    const { store, rows } = memoryStore([], { event_space: 5 });
    for (let buyer = 1; buyer <= 5; buyer += 1) {
      const result = await reserveAvatar(store, ask(`u${buyer}`, MYTHIC, true));
      expect(result).toMatchObject({ status: 'reserved', row: { serial: buyer, mint_status: 'pending' } });
    }
    expect(await reserveAvatar(store, ask('u6', MYTHIC))).toEqual({ status: 'sold_out' });
    expect(rows).toHaveLength(5);
  });

  it('two buyers racing for the last unit: one gets it, the other is told sold out, and there is never a sixth', async () => {
    const { store, rows, hooks } = memoryStore([], { event_space: 5 });
    for (let buyer = 1; buyer <= 4; buyer += 1) await reserveAvatar(store, ask(`u${buyer}`, MYTHIC, true));
    // Buyer A has read the taken serials and is about to insert #5 when buyer B does the whole thing.
    let second: Awaited<ReturnType<typeof reserveAvatar>> | undefined;
    hooks.beforeInsert = async () => {
      second = await reserveAvatar(store, ask('buyer-b', MYTHIC));
    };
    const first = await reserveAvatar(store, ask('buyer-a', MYTHIC));
    expect(second).toMatchObject({ status: 'reserved', row: { serial: 5, user_id: 'buyer-b' } });
    expect(first).toEqual({ status: 'sold_out' });
    expect(rows.filter((row) => row.item_key === 'event_space')).toHaveLength(5);
    expect(new Set(rows.map((row) => row.serial)).size).toBe(5);
    expect(Math.max(...rows.map((row) => row.serial))).toBe(5);
  });

  it('the same race started together still ends with exactly one winner', async () => {
    const { store, rows } = memoryStore([], { event_space: 5 });
    for (let buyer = 1; buyer <= 4; buyer += 1) await reserveAvatar(store, ask(`u${buyer}`, MYTHIC, true));
    const results = await Promise.all(['a', 'b', 'c'].map((buyer) => reserveAvatar(store, ask(buyer, MYTHIC))));
    expect(results.filter((result) => result.status === 'reserved')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'sold_out')).toHaveLength(2);
    expect(rows).toHaveLength(5);
  });

  it('a loser of a race on an open edition simply takes the next serial', async () => {
    const open = item('base_iniciante', { supply_cap: null });
    const { store, hooks } = memoryStore();
    let second: Awaited<ReturnType<typeof reserveAvatar>> | undefined;
    hooks.beforeInsert = async () => {
      second = await reserveAvatar(store, ask('b', open));
    };
    const first = await reserveAvatar(store, ask('a', open));
    expect(second).toMatchObject({ status: 'reserved', row: { serial: 1 } });
    expect(first).toMatchObject({ status: 'reserved', row: { serial: 2 } });
  });

  it('an unpaid hold keeps its serial for its window, is refreshed by the same learner and returns to the pool afterwards', async () => {
    const { store, rows } = memoryStore([], { event_space: 5 });
    for (let buyer = 1; buyer <= 4; buyer += 1) await reserveAvatar(store, ask(`u${buyer}`, MYTHIC, true));
    const held = await reserveAvatar(store, ask('slow', MYTHIC));
    expect(held).toMatchObject({ status: 'reserved', row: { serial: 5, mint_status: 'reserved', reserved_until: UNTIL.toISOString() } });
    expect(await reserveAvatar(store, ask('other', MYTHIC))).toEqual({ status: 'sold_out' });
    // Asking again is the same hold, not a second unit.
    expect(await reserveAvatar(store, ask('slow', MYTHIC))).toMatchObject({ status: 'reserved', row: { serial: 5 } });
    expect(rows).toHaveLength(5);
    // The window ends unpaid: the next buyer gets serial 5.
    const later = new Date(UNTIL.getTime() + 1);
    expect(await reserveAvatar(store, ask('other', MYTHIC, false, later))).toMatchObject({ status: 'reserved', row: { serial: 5, user_id: 'other' } });
    expect(rows.some((row) => row.user_id === 'slow')).toBe(false);
  });

  it('paying turns the hold into the unit; a hold that lapsed and was handed on leaves the payer with sold_out', async () => {
    const { store } = memoryStore([], { event_space: 5 });
    for (let buyer = 1; buyer <= 4; buyer += 1) await reserveAvatar(store, ask(`u${buyer}`, MYTHIC, true));
    await reserveAvatar(store, ask('payer', MYTHIC));
    expect(await reserveAvatar(store, ask('payer', MYTHIC, true))).toMatchObject({ status: 'reserved', row: { serial: 5, mint_status: 'pending', reserved_until: null } });
    expect(await reserveAvatar(store, ask('payer', MYTHIC, true))).toMatchObject({ status: 'owned', row: { serial: 5 } });

    const lapsed = memoryStore([], { event_space: 5 });
    for (let buyer = 1; buyer <= 4; buyer += 1) await reserveAvatar(lapsed.store, ask(`u${buyer}`, MYTHIC, true));
    await reserveAvatar(lapsed.store, ask('late-payer', MYTHIC));
    const later = new Date(UNTIL.getTime() + 1);
    await reserveAvatar(lapsed.store, ask('fast', MYTHIC, true, later));
    expect(await reserveAvatar(lapsed.store, ask('late-payer', MYTHIC, true, later))).toEqual({ status: 'sold_out' });
  });

  it('a lapsed hold nobody else took is still honoured when its owner pays late', async () => {
    const { store } = memoryStore([], { event_space: 5 });
    await reserveAvatar(store, ask('late', MYTHIC));
    const later = new Date(UNTIL.getTime() + 60_000);
    expect(await reserveAvatar(store, ask('late', MYTHIC, true, later))).toMatchObject({ status: 'reserved', row: { serial: 1, mint_status: 'pending' } });
  });

  it('limits the unpaid holds of limited avatars per learner, never the paid ones or the open editions', async () => {
    const caps = { event_space: 5, base_lider: 500, special_x: 25, base_iniciante: null };
    const { store } = memoryStore([], caps);
    const limited = [MYTHIC, LEADER, item('special_x', { supply_cap: 25 })];
    for (let index = 0; index < MAX_OPEN_RESERVATIONS; index += 1) expect((await reserveAvatar(store, ask('hoarder', limited[index]))).status).toBe('reserved');
    expect(await reserveAvatar(store, ask('hoarder', limited[MAX_OPEN_RESERVATIONS]))).toEqual({ status: 'reservation_limit' });
    expect((await reserveAvatar(store, ask('hoarder', item('base_iniciante', { supply_cap: null })))).status).toBe('reserved');
    expect((await reserveAvatar(store, ask('hoarder', limited[MAX_OPEN_RESERVATIONS], true))).status).toBe('reserved');
  });

  it('never reserves a free avatar and ties the hold to the intent window', async () => {
    const { store, rows } = memoryStore();
    expect(await reserveAvatar(store, ask('u', HAPPY))).toEqual({ status: 'free_item' });
    expect(rows).toHaveLength(0);
    expect(reservationUntil('2026-10-10T12:01:00.000Z').toISOString()).toBe('2026-10-10T12:03:00.000Z');
  });
});

describe('companion card and mirror', () => {
  const snapshot: CompanionSnapshot = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    userId: 'u',
    wallet: 'Wallet111',
    lives: 4,
    maxLives: 5,
    outfit: 'outfit_crown',
    stats: { level: 2, xp: 250, streak: 1 },
    assetAddress: null,
    mirrored: null,
    mirroredAt: null,
  };
  const PICTURE = 'data:image/webp;base64,UklGRg==';

  it('only an expression avatar allows an outfit', () => {
    expect(allowsOutfit('expression')).toBe(true);
    for (const group of ['base', 'special', 'event', 'accessory', '', null, undefined]) expect(allowsOutfit(group)).toBe(false);
  });

  it('draws the built-in Tera exactly as before for the default avatar', () => {
    expect(renderArt(companionArtInput({ ...snapshot, avatar: DEFAULT_AVATAR_KEY }, 'pt', null))).toBe(renderArt(companionArtInput(snapshot, 'pt')));
  });

  it('draws the equipped picture, with the outfit on an expression avatar and without it on a painting', () => {
    const expression = renderArt(companionArtInput({ ...snapshot, avatar: 'tera_feliz' }, 'pt', { key: 'tera_feliz', image: PICTURE, allowsOutfit: true }));
    expect(expression).toContain('data-avatar="tera_feliz"');
    expect(expression).toContain(PICTURE);
    expect(expression).toContain('data-outfit="outfit_crown"');
    expect(expression).not.toBe(renderArt(companionArtInput(snapshot, 'pt')));

    const painting = renderArt(companionArtInput({ ...snapshot, avatar: 'base_lider' }, 'pt', { key: 'base_lider', image: PICTURE, allowsOutfit: false }));
    expect(painting).toContain('data-avatar="base_lider"');
    expect(painting).not.toContain('data-outfit');
    expect(painting).not.toContain('data-outfit-layer');
  });

  it('falls back to the built-in Tera when the picture is missing or is not an inlined image', () => {
    const plain = renderArt(companionArtInput({ ...snapshot, outfit: null }, 'pt'));
    expect(renderArt(companionArtInput({ ...snapshot, outfit: null, avatar: 'base_lider' }, 'pt', { key: 'base_lider', image: null, allowsOutfit: false }))).toBe(plain);
    for (const image of ['https://evil.example/x.webp', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/webp;base64,AA"/><script>']) {
      const drawn = renderArt(companionArtInput({ ...snapshot, outfit: null, avatar: 'base_lider' }, 'pt', { key: 'base_lider', image, allowsOutfit: false }));
      expect(drawn).toBe(plain);
    }
    // A painting whose picture failed still wears no outfit.
    expect(renderArt(companionArtInput({ ...snapshot, avatar: 'base_lider' }, 'pt', { key: 'base_lider', image: null, allowsOutfit: false }))).not.toContain('data-outfit');
  });

  it('mirrors the avatar only when it is not the default, after every existing attribute', () => {
    const before = companionAttributes(snapshot);
    expect(companionAttributes({ ...snapshot, avatar: DEFAULT_AVATAR_KEY })).toEqual(before);
    expect(companionAttributes({ ...snapshot, avatar: 'tera_feliz' })).toEqual([...before, { key: 'avatar', value: 'tera_feliz' }]);
    expect(companionAttributes({ ...snapshot, avatar: '"><script>' })).toEqual(before);
    expect(companionFromAttributes(companionAttributes({ ...snapshot, avatar: 'tera_feliz' })).avatar).toBe('tera_feliz');
    expect('avatar' in companionFromAttributes(before)).toBe(false);
  });

  it('versions the chain art by avatar and leaves the default URL untouched', () => {
    const values = { lives: 4, max_lives: 5, outfit: null, level: 2, xp: 0, streak: 0 };
    const plain = companionChainImageUrl('https://f', snapshot.id, values);
    expect(companionChainImageUrl('https://f', snapshot.id, { ...values, avatar: DEFAULT_AVATAR_KEY })).toBe(plain);
    expect(companionChainImageUrl('https://f', snapshot.id, { ...values, avatar: 'tera_feliz' })).toBe(`${plain}-tera_feliz`);
  });
});

describe('profile avatars', () => {
  const config = { authority: 'Auth111', collection_avatars: 'Coll111' };
  const row: AvatarAssetRow = { id: 'r1', user_id: 'u', item_key: 'base_lider', serial: 7, purchase_id: 'p', mint_status: 'minted', reserved_until: null, wallet: 'Wallet111', asset_address: 'Asset111', tx_signature: 'sig', minted_at: '2026-10-10T12:00:00.000Z' };
  const onchain = (owner: string, patch = {}) => new Map([['Asset111', { address: 'Asset111', owner, frozen: false, attributes: [], collection: 'Coll111', update_authority: 'Auth111', ...patch }]]);
  const list = (chain: ReturnType<typeof onchain>) => profileAvatars({ wallet: 'Wallet111', lang: 'pt', supabaseUrl: SUPABASE, config, catalog, rows: [row], onchain: chain });

  it('verifies a collectible the wallet still holds, without asking it to be frozen', () => {
    expect(list(onchain('Wallet111'))).toEqual([
      expect.objectContaining({ key: 'base_lider', title: 'Líder', rarity: 'rare', tier_name: 'Super Tera', serial: 7, asset: 'Asset111', verified: true, image_url: `${SUPABASE}/storage/v1/object/public/tera-avatars/base_lider.webp` }),
    ]);
  });

  it('shows a transferred-away, foreign or unread avatar as not verified', () => {
    expect(list(onchain('SomeoneElse'))[0].verified).toBe(false);
    expect(list(onchain('Wallet111', { collection: 'Other' }))[0].verified).toBe(false);
    expect(list(onchain('Wallet111', { update_authority: 'Other' }))[0].verified).toBe(false);
    expect(list(new Map())[0].verified).toBe(false);
    expect(isCollectibleVerified(onchain('Wallet111').get('Asset111'), { wallet: 'Wallet111', collection: undefined, authority: 'Auth111' })).toBe(false);
  });
});
