/**
 * Splits a title into "everything but the last word" and "the last word",
 * for the v2/v3 catalog page title treatment (one word colored, never the
 * whole sentence).
 */
export function lastWord(title: string): { rest: string; last: string } {
  const cut = title.lastIndexOf(' ');
  if (cut <= 0) return { rest: '', last: title };
  return { rest: title.slice(0, cut + 1), last: title.slice(cut + 1) };
}
