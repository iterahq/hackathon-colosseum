/**
 * Human-friendly date+time for a scheduled class ("Próxima aula" card), in the
 * active app locale. Returns '' for a missing/invalid timestamp so the caller
 * can hide the cue instead of showing "Invalid Date".
 */
export function formatScheduledAt(iso: string | null | undefined, locale: 'pt' | 'en'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tag = locale === 'pt' ? 'pt-BR' : 'en-US';
  return new Intl.DateTimeFormat(tag, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
