/**
 * Natural-language duration in pt-BR — "7 segundos", "1 minuto e 15 segundos",
 * "2 minutos". Used for the learner's "você levou …" hint, where a spelled-out
 * duration reads better than the compact mm:ss.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  const secStr = `${secs} ${secs === 1 ? 'segundo' : 'segundos'}`;
  if (mins === 0) return secStr;
  const minStr = `${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
  return secs === 0 ? minStr : `${minStr} e ${secStr}`;
}
