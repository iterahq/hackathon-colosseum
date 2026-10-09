/**
 * Natural-language duration — "7 segundos", "1 minuto e 15 segundos",
 * "2 minutos" (pt) or "7 seconds", "1 minute and 15 seconds" (en). Used for the
 * learner's "you took …" hint, where a spelled-out duration reads better than
 * the compact mm:ss. Words come from the caller's `t` so the locale follows the
 * app language.
 */
export function formatDuration(totalSeconds: number, t: (key: string) => string): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  const secStr = `${secs} ${t(secs === 1 ? 'duration.second' : 'duration.seconds')}`;
  if (mins === 0) return secStr;
  const minStr = `${mins} ${t(mins === 1 ? 'duration.minute' : 'duration.minutes')}`;
  return secs === 0 ? minStr : `${minStr} ${t('duration.and')} ${secStr}`;
}
