import type { ArtInput, CompanionAvatarArt, Lang } from './art.ts';
import { DEFAULT_AVATAR_KEY } from './avatars.ts';
import { isFrame, isInk, isOutfit, type Frame, type Ink } from './cosmetics.ts';

export const PREVIEW_MAX_TRAIL = 40;
export const PREVIEW_MAX_DAYS = 12;
export const PREVIEW_MAX_LIVES = 10;
export const PREVIEW_MAX_LEVEL = 99;

export interface CertificationPreview {
  type: 'certification';
  trail: string;
  days: number;
  total: number;
  tier: 'bronze' | 'gold';
  ink: Ink | null;
  frame: Frame | null;
  lang: Lang;
}

export interface CompanionPreview {
  type: 'companion';
  avatar: string;
  outfit: string | null;
  lives: number;
  level: number;
  lang: Lang;
}

export type PreviewRequest = CertificationPreview | CompanionPreview;

const DEFAULT_TRAIL = { pt: 'Sua trilha', en: 'Your trail' } as const;

/** A whole number from a query value, clamped. Anything that is not one reads as the fallback. */
export function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null || !/^-?\d{1,6}$/.test(value.trim())) return fallback;
  return Math.min(max, Math.max(min, Number.parseInt(value.trim(), 10)));
}

/** Free text for the page: control characters dropped, whitespace collapsed, cut to the limit. Escaping is the renderer's. */
export function cleanTrail(value: string | null, lang: Lang): string {
  const text = [...(value ?? '')]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, PREVIEW_MAX_TRAIL).join('').trim() || DEFAULT_TRAIL[lang];
}

/**
 * The preview a query string asks for. Never refuses: every parameter is
 * validated and clamped, and an unknown value falls back to its default. Only
 * `type` decides the shape; `null` when it names neither.
 */
export function parsePreview(params: URLSearchParams, avatarKeys: ReadonlySet<string>): PreviewRequest | null {
  const lang: Lang = params.get('lang') === 'en' ? 'en' : 'pt';
  const type = params.get('type');
  if (type === 'certification') {
    const total = clampInt(params.get('total'), 1, PREVIEW_MAX_DAYS, 5);
    const days = clampInt(params.get('days'), 0, total, total);
    const tier = params.get('tier');
    const ink = params.get('ink');
    const frame = params.get('frame');
    return {
      type,
      trail: cleanTrail(params.get('trail'), lang),
      days,
      total,
      // Gold is the completed page: asked for outright, or implied by a full page when no tier is named.
      tier: tier === 'gold' ? 'gold' : tier === 'bronze' ? 'bronze' : days >= total ? 'gold' : 'bronze',
      ink: isInk(ink) ? ink : null,
      frame: isFrame(frame) ? frame : null,
      lang,
    };
  }
  if (type === 'companion') {
    const avatar = params.get('avatar');
    const outfit = params.get('outfit');
    return {
      type,
      // A strict allow-list: only keys of the catalog are ever turned into a storage URL.
      avatar: avatar !== null && avatarKeys.has(avatar) ? avatar : DEFAULT_AVATAR_KEY,
      outfit: isOutfit(outfit) ? outfit : null,
      lives: clampInt(params.get('lives'), 0, PREVIEW_MAX_LIVES, PREVIEW_MAX_LIVES),
      level: clampInt(params.get('level'), 1, PREVIEW_MAX_LEVEL, 1),
      lang,
    };
  }
  return null;
}

const BASE: Pick<ArtInput, 'glyph' | 'accent' | 'programSlug' | 'serial' | 'highlightDay'> = {
  glyph: '',
  accent: null,
  programSlug: 'itera',
  serial: 'PREVIEW',
  highlightDay: null,
};

/** The same input the real endpoints hand to `renderArt`, built from the query alone. */
export function previewArtInput(preview: PreviewRequest, avatar: CompanionAvatarArt | null = null): ArtInput {
  if (preview.type === 'certification') {
    return {
      ...BASE,
      shape: 'passport',
      tier: preview.tier,
      title: preview.lang === 'pt' ? 'Certificação do Tera' : 'Tera Certification',
      subtitle: preview.trail,
      daysDone: preview.days,
      totalDays: preview.total,
      stampedDays: Array.from({ length: preview.days }, (_, index) => index + 1),
      lang: preview.lang,
      ink: preview.ink,
      frame: preview.frame,
    };
  }
  return {
    ...BASE,
    shape: 'companion',
    tier: 'bronze',
    title: preview.lang === 'pt' ? 'Tera companheiro' : 'Tera companion',
    subtitle: '',
    daysDone: 0,
    totalDays: 0,
    stampedDays: [],
    lang: preview.lang,
    companion: { lives: preview.lives, maxLives: PREVIEW_MAX_LIVES, level: preview.level, outfit: preview.outfit, avatar },
  };
}
