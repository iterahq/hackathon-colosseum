/**
 * Local stand-in for the lives / shop / companion functions, used only in dev and preview while the
 * backend is not deployed (or when `?mockShop=1` forces it). Speaks the WIRE shape of the contract,
 * so the same normalisers parse it. State lives in localStorage; URL knobs: `mockLives=<n>`,
 * `mockWallet=<address>`, `mockRegen=<seconds>`, `mockOwned=<key,key>`, `mockOutfit=<key>`, `mockAvatar=<key>`, `mockRefs=<item:ref,item:ref>`, `mockReset=1`.
 */
import { isFreeMockAvatar, isMockAvatar, mockAvatarBlock, mockAvatarItems, mockAvatarPrice } from '@/services/shopMockAvatars';
import { MOCK_ITEMS } from '@/services/shopMockData';
import { DEFAULT_MAX_LIVES, DEFAULT_REGEN_SECONDS, loseLife, regenerate } from '@/utils/lives';
import { priceLabel } from '@/utils/shopPrice';

interface MockState {
  current: number;
  nextRegenAt: string | null;
  regenSeconds: number;
  owned: string[];
  outfit: string | null;
  wallet: string | null;
  attempts: string[];
  intents: Record<string, { item: string; polls: number; ref: string | null }>;
  asset: string | null;
  refs: Record<string, string[]>;
  avatar: string;
}

type Body = Record<string, unknown>;
const KEY = 'itera.mockShop.v1';
const MOCK_ASSET = 'TeRaMockCompanion1111111111111111111111111';
let seeded = false;

const fresh = (): MockState => ({ current: DEFAULT_MAX_LIVES, nextRegenAt: null, regenSeconds: DEFAULT_REGEN_SECONDS, owned: [], outfit: null, wallet: null, attempts: [], intents: {}, asset: null, refs: {}, avatar: 'tera_normal' });

function read(): MockState {
  try {
    return { ...fresh(), ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<MockState>) };
  } catch {
    return fresh();
  }
}

function write(state: MockState): MockState {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the mock just forgets */
  }
  return state;
}

function seedFromUrl(state: MockState): MockState {
  if (seeded || typeof window === 'undefined') return state;
  seeded = true;
  const q = new URLSearchParams(window.location.search);
  let next = q.get('mockReset') ? fresh() : state;
  const lives = q.get('mockLives');
  if (lives !== null) {
    const current = Math.min(DEFAULT_MAX_LIVES, Math.max(0, Number(lives) || 0));
    const regenSeconds = Number(q.get('mockRegen')) || next.regenSeconds;
    next = { ...next, current, regenSeconds, nextRegenAt: current < DEFAULT_MAX_LIVES ? new Date(Date.now() + regenSeconds * 1000).toISOString() : null };
  }
  if (q.get('mockWallet')) next = { ...next, wallet: q.get('mockWallet'), asset: MOCK_ASSET };
  if (q.get('mockOwned')) next = { ...next, owned: (q.get('mockOwned') ?? '').split(',').filter(Boolean) };
  if (q.has('mockOutfit')) next = { ...next, outfit: q.get('mockOutfit') || null };
  if (q.get('mockAvatar')) next = { ...next, avatar: q.get('mockAvatar') ?? next.avatar };
  if (q.get('mockRefs')) {
    const refs: Record<string, string[]> = {};
    for (const pair of (q.get('mockRefs') ?? '').split(',')) {
      const [item, ref] = pair.split(':');
      if (item && ref) refs[item] = [...(refs[item] ?? []), ref];
    }
    next = { ...next, refs };
  }
  return write(next);
}

function load(): MockState {
  const state = seedFromUrl(read());
  const lives = regenerate({ current: state.current, max: DEFAULT_MAX_LIVES, nextRegenAt: state.nextRegenAt, regenSeconds: state.regenSeconds }, Date.now());
  return lives.current === state.current ? state : write({ ...state, current: lives.current, nextRegenAt: lives.nextRegenAt });
}

const livesWire = (s: MockState) => ({
  current: s.current,
  max: DEFAULT_MAX_LIVES,
  next_regen_at: s.nextRegenAt,
  regen_seconds: s.nextRegenAt ? Math.max(0, Math.ceil((Date.parse(s.nextRegenAt) - Date.now()) / 1000)) : 0,
  regen_interval_seconds: s.regenSeconds,
});
const companionWire = (s: MockState) => ({
  asset_address: s.asset,
  mint_status: s.asset ? 'minted' : 'unclaimed',
  explorer_url: s.asset ? `https://explorer.solana.com/address/${s.asset}?cluster=devnet` : null,
  outfit: s.outfit,
  level: 4,
  xp: 780,
  streak: 3,
});
const inventoryWire = (s: MockState) =>
  s.owned.map((key) => ({ item_key: key, kind: isMockAvatar(key) ? 'avatar' : (MOCK_ITEMS.find((i) => i.key === key)?.kind ?? 'outfit'), qty: 1, equipped: s.outfit === key || s.avatar === key }));
const langOf = (v: unknown) => (v === 'en' ? 'en' : 'pt');
const snapshot = (s: MockState, lang: unknown = 'pt') => ({ lives: livesWire(s), companion: companionWire(s), avatar: mockAvatarBlock(langOf(lang), s), inventory: inventoryWire(s), wallet: s.wallet });

function companion(body: Body) {
  let s = load();
  const equip = body.equip as { outfit?: string | null; avatar?: string } | undefined;
  if (equip && 'outfit' in equip) {
    const outfit = equip.outfit ?? null;
    if (outfit === null || s.owned.includes(outfit)) s = write({ ...s, outfit });
  }
  if (equip?.avatar && (isFreeMockAvatar(equip.avatar) || s.owned.includes(equip.avatar))) s = write({ ...s, avatar: equip.avatar });
  return snapshot(s, body.lang);
}

function lives(body: Body) {
  let s = load();
  if (body.action === 'lose') {
    const attempt = String(body.attempt_id ?? '');
    if (!s.attempts.includes(attempt)) {
      const next = loseLife({ current: s.current, max: DEFAULT_MAX_LIVES, nextRegenAt: s.nextRegenAt, regenSeconds: s.regenSeconds }, Date.now());
      s = write({ ...s, current: next.current, nextRegenAt: next.nextRegenAt, attempts: [...s.attempts.slice(-50), attempt] });
    }
    return { lives: livesWire(s), companion: companionWire(s) };
  }
  const perfect = body.action === 'lesson_end' && Number(body.mistakes) === 0 && s.current < DEFAULT_MAX_LIVES;
  if (perfect) s = write({ ...s, current: s.current + 1, nextRegenAt: s.current + 1 >= DEFAULT_MAX_LIVES ? null : s.nextRegenAt });
  return { lives: livesWire(s), companion: companionWire(s), bonus: perfect ? 'granted' : Number(body.mistakes) > 0 ? 'mistakes' : 'full' };
}

function shopItems(lang: string) {
  const s = load();
  const l = langOf(lang);
  const catalog = MOCK_ITEMS.map((i) => ({
    key: i.key,
    kind: i.kind,
    title: i.title[l],
    description: i.description[l],
    price_usd_cents: i.cents,
    price_lamports: i.lamports,
    price_label: priceLabel(null, i.cents, i.lamports),
    art: i.art,
    owned: s.owned.includes(i.key),
    equipped: s.outfit === i.key,
    owned_refs: s.refs[i.key] ?? [],
  }));
  return [...catalog, ...mockAvatarItems(l, s)];
}

function purchaseIntent(body: Body) {
  const s = load();
  const key = String(body.item_key ?? '');
  const item = MOCK_ITEMS.find((i) => i.key === key) ?? (isMockAvatar(key) ? { key, ...mockAvatarPrice(key) } : null);
  if (!item) throw new Error('mock: unknown item');
  const id = `mock-${Date.now().toString(36)}`;
  write({ ...s, intents: { [id]: { item: item.key, polls: 0, ref: typeof body.ref_id === 'string' ? body.ref_id : null } } });
  return {
    intent_id: id,
    message_base58: 'MockMessage1111111111111111111111',
    message_base64: 'TW9jaw==',
    transaction_base58: 'MockTransaction11111111111111111',
    transaction_base64: 'TW9jaw==',
    price_lamports: item.lamports,
    price_usd_cents: item.cents,
    price_label: priceLabel(null, item.cents, item.lamports),
    last_valid_block_height: 0,
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    cluster: 'devnet',
  };
}

function purchaseConfirm(body: Body) {
  let s = load();
  const id = String(body.intent_id ?? '');
  const intent = s.intents[id];
  if (!intent) return { status: 'expired', item: null, inventory: inventoryWire(s), explorer_url: null };
  if (intent.polls < 1) {
    write({ ...s, intents: { [id]: { ...intent, polls: intent.polls + 1 } } });
    return { status: 'pending', item: intent.item, inventory: inventoryWire(s), explorer_url: null };
  }
  if (intent.item === 'life_refill') s = { ...s, current: DEFAULT_MAX_LIVES, nextRegenAt: null };
  else if (isMockAvatar(intent.item)) s = { ...s, owned: [...new Set([...s.owned, intent.item])] };
  else if (intent.item.startsWith('outfit_')) s = { ...s, owned: [...new Set([...s.owned, intent.item])], outfit: intent.item };
  else if (intent.ref) s = { ...s, refs: { ...s.refs, [intent.item]: [...new Set([...(s.refs[intent.item] ?? []), intent.ref])] } };
  s = write({ ...s, asset: s.asset ?? MOCK_ASSET });
  return {
    status: 'paid',
    item: { key: intent.item, kind: isMockAvatar(intent.item) ? 'avatar' : (MOCK_ITEMS.find((i) => i.key === intent.item)?.kind ?? 'outfit') },
    avatar: isMockAvatar(intent.item) ? { key: intent.item, asset_address: s.asset, image_url: mockAvatarBlock('pt', { ...s, avatar: intent.item }).image_url } : undefined,
    lives: livesWire(s),
    companion: companionWire(s),
    inventory: inventoryWire(s),
    explorer_url: `https://explorer.solana.com/tx/${String(body.signature ?? 'mock')}?cluster=devnet`,
  };
}

export function mockShopCall(fn: string, body: Body, query: Record<string, string>): unknown {
  if (fn === 'companion') return companion(body);
  if (fn === 'lives') return lives(body);
  if (fn === 'shop-items') return shopItems(query.lang ?? 'pt');
  if (fn === 'purchase-intent') return purchaseIntent(body);
  if (fn === 'purchase-confirm') return purchaseConfirm(body);
  if (fn === 'wallet-faucet') return { signature: 'MockFaucetSignature1111111111111111' };
  throw new Error(`mock: unknown function ${fn}`);
}
