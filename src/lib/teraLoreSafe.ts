/** Reads `src/content/teraLore.ts` when it exists; without it every lookup is null and the UI shows the backend title. */
export interface TeraLoreEntry {
  name: string;
  epithet: string;
  story: string;
  quote: string;
}
type LoreModule = { loreOf?: (key: string, locale: string) => TeraLoreEntry | null };

const modules = import.meta.glob<LoreModule>('/src/content/teraLore.ts', { eager: true });
const lore = Object.values(modules)[0]?.loreOf;

export const loreOf = (key: string, locale: string): TeraLoreEntry | null => lore?.(key, locale) ?? null;
