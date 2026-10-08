/**
 * The viewport of the page inside the native shell: a native app does not zoom with a pinch, so the shell
 * surface pins the scale. A browser tab keeps its zoom (it is an accessibility control there).
 */
const LOCK = { 'maximum-scale': '1', 'user-scalable': 'no' } as const;

/** `content` of the viewport meta with the scale pinned; every other directive is kept as written. */
export function lockedViewport(content: string): string {
  const kept = content
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !(part.split('=')[0].trim().toLowerCase() in LOCK));
  return [...kept, ...Object.entries(LOCK).map(([name, value]) => `${name}=${value}`)].join(', ');
}
