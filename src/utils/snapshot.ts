/** "12/10/2026, 14:05" in the viewer's own timezone, or null when there is no (valid) mirror time. */
export function snapshotWhen(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
