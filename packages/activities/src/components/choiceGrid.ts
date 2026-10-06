/**
 * Options that are only a few characters ("A", "B", "<h1>", "12 px") sit side by
 * side instead of one per row: three stacked rows for three letters cost a
 * screen's worth of scroll under the snippets they point at.
 */
interface GridOption {
  label?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
}

const ROW: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };
const ONE_ROW_MAX_CHARS = 6;
const TWO_COLUMN_MAX_CHARS = 14;

export function choiceGridClass(options: GridOption[]): string {
  if (options.length < 2 || options.some((o) => o.image_url || o.audio_url || !o.label)) return '';
  const longest = Math.max(...options.map((o) => (o.label ?? '').length));
  if (longest <= ONE_ROW_MAX_CHARS && ROW[options.length]) return ROW[options.length];
  if (longest <= TWO_COLUMN_MAX_CHARS) return 'grid-cols-2';
  return '';
}
