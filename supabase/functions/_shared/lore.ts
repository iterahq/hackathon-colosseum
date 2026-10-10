import data from './tera-lore.json' with { type: 'json' };

export type LoreLang = 'pt' | 'en';
type Text = { pt?: string; en?: string };

/** One avatar's entry in `tera-lore.json`. */
export interface LoreEntry {
  name: Text;
  epithet: Text;
  story: Text;
  quote: Text;
}

/** The lore of an avatar, resolved to one language, as the API returns it. */
export interface Lore {
  name: string;
  epithet: string;
  story: string;
  quote: string;
}

const AVATARS = (data as { avatars: Record<string, LoreEntry> }).avatars;

/** The lore entry of an avatar key, or `null` when it has none. Never throws. */
export function loreOf(key: string | null | undefined): LoreEntry | null {
  if (!key || !Object.prototype.hasOwnProperty.call(AVATARS, key)) return null;
  return AVATARS[key] ?? null;
}

/** One field in one language, falling back to the other language; empty string when absent. */
export function loreText(field: Text | null | undefined, lang: LoreLang): string {
  const other = lang === 'pt' ? 'en' : 'pt';
  return field?.[lang]?.trim() || field?.[other]?.trim() || '';
}

/** The `lore` block of an API answer: `null` for an avatar without lore. */
export function loreView(key: string | null | undefined, lang: LoreLang): Lore | null {
  const entry = loreOf(key);
  if (!entry) return null;
  return {
    name: loreText(entry.name, lang),
    epithet: loreText(entry.epithet, lang),
    story: loreText(entry.story, lang),
    quote: loreText(entry.quote, lang),
  };
}
