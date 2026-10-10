/**
 * The name and story of a Tera avatar. The lore lives in `src/content/teraLore.ts`, written apart
 * from this slice: the glob resolves to nothing while that module does not exist, and every caller
 * treats `null` as "no lore, draw the plain title".
 */
import type { AvatarLore } from '@/types/avatarShop';

type LoreModule = { loreOf?: (key: string, locale: string) => Partial<AvatarLore> | null | undefined };

const modules = import.meta.glob<LoreModule>('/src/content/teraLore.ts', { eager: true });
const lore = Object.values(modules)[0];

export function avatarLore(key: string, locale: string): AvatarLore | null {
  try {
    const found = lore?.loreOf?.(key, locale);
    if (!found?.name) return null;
    return { name: found.name, epithet: found.epithet ?? '', story: found.story ?? '', quote: found.quote ?? '' };
  } catch {
    return null;
  }
}
