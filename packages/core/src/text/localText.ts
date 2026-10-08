/** A text in several locales, by locale code. */
export type LocalText = Readonly<Record<string, string | undefined>>;

/** The text in `locale`, else English, else Portuguese, else the first one present: the order of the web's `tText`. */
export function localText(text: LocalText | null | undefined, locale: string): string {
  if (!text) return '';
  return text[locale] ?? text.en ?? text.pt ?? Object.values(text).find(Boolean) ?? '';
}
