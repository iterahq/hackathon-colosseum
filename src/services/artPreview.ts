/**
 * Try-on art drawn by the backend, public and without a session: `credential-meta/preview.svg`.
 * The ONE place its URL is built. The answer is an image; callers fall back to the client's own
 * drawing when it does not load.
 */
import type { ShopItem } from '@/types/shop';

const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export interface CertificationPreview {
  trail: string;
  days: number;
  total: number;
  tier?: string | null;
  ink?: string | null;
  frame?: string | null;
  lang: string;
}

export interface CompanionPreview {
  avatar: string;
  outfit?: string | null;
  lives?: number;
  level?: number;
}

function previewUrl(params: Record<string, string | number | null | undefined>): string | null {
  if (!base) return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  return `${base}/functions/v1/credential-meta/preview.svg?${query.toString()}`;
}

export function certificationPreviewUrl({ trail, days, total, tier, ink, frame, lang }: CertificationPreview): string | null {
  const gold = total > 0 && days >= total;
  return previewUrl({ type: 'certification', trail, days, total, tier: tier ?? (gold ? 'gold' : 'bronze'), ink, frame, lang: lang === 'en' ? 'en' : 'pt' });
}

export function companionPreviewUrl({ avatar, outfit, lives = 5, level = 1 }: CompanionPreview): string | null {
  return previewUrl({ type: 'companion', avatar, outfit: outfit || 'none', lives, level });
}

const artValue = (item: ShopItem, field: string): string | null => {
  const value = item.art[field];
  return typeof value === 'string' && value ? value : null;
};

/** The `ink` / `frame` parameter an item stands for: the backend's `art` block, or the key (`frame_gold_leaf` -> `gold-leaf`). */
export function cosmeticOf(item: ShopItem): { ink: string | null; frame: string | null } {
  const fromKey = item.key.replace(/^(ink|frame)_/, '').replace(/_/g, '-');
  if (item.kind === 'ink') return { ink: artValue(item, 'ink') ?? fromKey, frame: null };
  if (item.kind === 'frame') return { ink: null, frame: artValue(item, 'frame') ?? fromKey };
  return { ink: null, frame: null };
}
