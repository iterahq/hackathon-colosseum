/** Appends an alpha channel (0-100%) to a 6-digit hex color, e.g. for a border. */
export function hexAlpha(hex: string, percent: number): string {
  const channel = Math.round((percent / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${channel}`;
}
