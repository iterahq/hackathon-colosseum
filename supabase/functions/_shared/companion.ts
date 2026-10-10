import type { ArtInput, CompanionAvatarArt, Lang } from './art.ts';
import { DEFAULT_AVATAR_KEY, isAvatarKey } from './avatars.ts';
import { isOutfit } from './cosmetics.ts';
import { APP_URL, type OnchainAttribute } from './credential.ts';
import type { CompanionStats } from './lives.ts';

export const COMPANION_ASSET_NAME = 'Tera Companion';

/** What the companion's metadata, art and on-chain mirror are drawn from. */
export interface CompanionSnapshot {
  id: string;
  userId: string;
  /** The wallet that owns the asset. It is what the on-chain `learner` attribute says: never the internal id. */
  wallet?: string | null;
  lives: number;
  maxLives: number;
  outfit: string | null;
  /** The avatar the learner wears (an item key). Unset reads as the default. */
  avatar?: string | null;
  stats: CompanionStats;
  assetAddress: string | null;
  /** The attributes last written on chain and when; `null` before the first mirror or when unknown. */
  mirrored: OnchainAttribute[] | null;
  mirroredAt: string | null;
}

const TEXT = {
  pt: { name: 'Tera companheiro', description: 'O companheiro de estudos na Itera: vidas, nível e visual acompanham o aprendizado.' },
  en: { name: 'Tera companion', description: 'The study companion at Itera: lives, level and outfit follow the learning.' },
} as const;

export function companionMetadataUrl(functionsBase: string, companionId: string): string {
  return `${functionsBase}/credential-meta/companion/${companionId}`;
}

export function companionImageUrl(functionsBase: string, companionId: string): string {
  return `${companionMetadataUrl(functionsBase, companionId)}/image.svg`;
}

/**
 * Art that draws what the asset says (`source=chain`) instead of the live
 * database row. The values are part of the URL, so a cached image is never stale.
 */
export function companionChainImageUrl(functionsBase: string, companionId: string, values: CompanionValues, lang?: Lang): string {
  // The default avatar leaves the URL exactly as it was before avatars existed.
  const worn = values.avatar && values.avatar !== DEFAULT_AVATAR_KEY ? `-${values.avatar}` : '';
  const version = `${values.lives}-${values.max_lives}-${values.level}-${values.outfit ?? 'none'}${worn}`;
  return `${companionImageUrl(functionsBase, companionId)}?source=chain${lang ? `&lang=${lang}` : ''}&v=${version}`;
}

/**
 * The Attributes plugin of the companion asset: a mirror of the database.
 * `learner` is the owner's wallet (public already: it owns the asset). The
 * internal learner id was written there before and stays on assets minted
 * then until their next ordinary write; it is never written again.
 * `avatar` is written only while the learner wears something other than the
 * default (absent = `tera_normal`), so a companion that never changed its
 * avatar is not rewritten because avatars exist.
 */
export function companionAttributes(snapshot: CompanionSnapshot): OnchainAttribute[] {
  const avatar = isAvatarKey(snapshot.avatar) && snapshot.avatar !== DEFAULT_AVATAR_KEY ? snapshot.avatar : null;
  return [
    { key: 'kind', value: 'companion' },
    { key: 'lives', value: String(snapshot.lives) },
    { key: 'max_lives', value: String(snapshot.maxLives) },
    { key: 'outfit', value: isOutfit(snapshot.outfit) ? snapshot.outfit : 'none' },
    { key: 'level', value: String(snapshot.stats.level) },
    { key: 'xp', value: String(snapshot.stats.xp) },
    { key: 'streak', value: String(snapshot.stats.streak) },
    { key: 'learner', value: snapshot.wallet ?? '' },
    ...(avatar ? [{ key: 'avatar', value: avatar }] : []),
  ];
}

export interface CompanionValues {
  lives: number;
  max_lives: number;
  outfit: string | null;
  level: number;
  xp: number;
  streak: number;
  /** The avatar key the asset names; absent when it names none (the default avatar). */
  avatar?: string;
}

/** The companion as its asset's attributes say it. A missing or malformed number reads as 0. */
export function companionFromAttributes(attributes: OnchainAttribute[]): CompanionValues {
  const values = new Map(attributes.map(({ key, value }) => [key, value]));
  const integer = (key: string) => {
    const parsed = Number.parseInt(values.get(key) ?? '', 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  };
  const outfit = values.get('outfit');
  const avatar = values.get('avatar');
  return {
    lives: integer('lives'),
    max_lives: integer('max_lives'),
    outfit: isOutfit(outfit) ? outfit : null,
    level: integer('level'),
    xp: integer('xp'),
    streak: integer('streak'),
    // Named only when the asset names one: a companion on the default avatar reads exactly as before.
    ...(isAvatarKey(avatar) && avatar !== DEFAULT_AVATAR_KEY ? { avatar } : {}),
  };
}

/** The snapshot redrawn with the values an asset carries; identity and serial stay the row's. */
export function withChainValues(snapshot: CompanionSnapshot, values: CompanionValues): CompanionSnapshot {
  return {
    ...snapshot,
    lives: values.lives,
    maxLives: values.max_lives,
    outfit: values.outfit,
    avatar: values.avatar ?? DEFAULT_AVATAR_KEY,
    stats: { ...snapshot.stats, level: values.level, xp: values.xp, streak: values.streak },
  };
}

export function sameAttributes(a: OnchainAttribute[] | null, b: OnchainAttribute[]): boolean {
  return a !== null && a.length === b.length && a.every((entry, index) => entry.key === b[index].key && entry.value === b[index].value);
}

export function companionArtInput(snapshot: CompanionSnapshot, lang: Lang, avatar: CompanionAvatarArt | null = null): ArtInput {
  return {
    shape: 'companion',
    tier: 'bronze',
    title: TEXT[lang].name,
    subtitle: '',
    daysDone: 0,
    totalDays: 0,
    stampedDays: [],
    highlightDay: null,
    glyph: '',
    accent: null,
    programSlug: '',
    serial: snapshot.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    lang,
    companion: {
      lives: snapshot.lives,
      maxLives: snapshot.maxLives,
      level: snapshot.stats.level,
      outfit: isOutfit(snapshot.outfit) ? snapshot.outfit : null,
      avatar,
    },
  };
}

/** Metaplex-standard JSON for the companion. Keyed by the companion id: no user id, name or email. */
export function companionMetadata(snapshot: CompanionSnapshot, lang: Lang, functionsBase: string) {
  const image = `${companionImageUrl(functionsBase, snapshot.id)}${lang === 'en' ? '' : `?lang=${lang}`}`;
  return {
    name: TEXT[lang].name,
    symbol: 'ITERA',
    description: TEXT[lang].description,
    image,
    external_url: snapshot.assetAddress ? `${APP_URL}/c/${snapshot.assetAddress}` : APP_URL,
    attributes: [
      { trait_type: 'Kind', value: 'companion' },
      { trait_type: 'Lives', value: snapshot.lives },
      { trait_type: 'Max lives', value: snapshot.maxLives },
      { trait_type: 'Outfit', value: isOutfit(snapshot.outfit) ? snapshot.outfit : 'none' },
      { trait_type: 'Level', value: snapshot.stats.level },
      { trait_type: 'XP', value: snapshot.stats.xp },
      { trait_type: 'Streak', value: snapshot.stats.streak },
    ],
    properties: { category: 'image', files: [{ uri: image, type: 'image/svg+xml' }] },
  };
}

export function companionText(lang: Lang): { name: string; description: string } {
  return TEXT[lang];
}
