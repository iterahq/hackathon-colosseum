/**
 * "Does this source line open the element the DOM shows?" — the check that
 * stops a stamp from being confidently wrong, shared by `source-stamp.spec.ts`
 * and `capture-regions.spec.ts`.
 *
 * A web page writes the DOM tag itself: the `<h1>` in the DOM comes from a line
 * that opens `<h1`.
 *
 * A UNIVERSAL screen (`packages/screens`) writes `View` / `Text` from
 * `react-native`, and react-native-web picks the DOM tag at runtime from the
 * props: `Text role="heading" aria-level={1}` renders an `<h1>`, `role="link"`
 * with `href` an `<a>`, a plain `View` a `<div>`. The `sourceStamp` plugin of
 * `@devfellowship/ux-paths-capture` (>= 0.4.0) stamps those elements through
 * `dataSet`. For such a stamp the line must open a component that THIS FILE
 * imports from `react-native`. A line that opens anything else — or a
 * `View` from some other module — still fails.
 */

const UNIVERSAL_MODULES = ['react-native', 'react-native-web'];

/** The local names a file binds with `import { … } from 'react-native'`. */
export function universalNames(lines: readonly string[]): Set<string> {
  const names = new Set<string>();
  const source = lines.join('\n');
  const importRe = /import\s+(?!type\s)\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importRe)) {
    if (!UNIVERSAL_MODULES.includes(match[2])) continue;
    for (const raw of match[1].split(',')) {
      const spec = raw.trim();
      if (!spec || spec.startsWith('type ')) continue;
      const local = spec.split(/\s+as\s+/).pop()!.trim();
      if (/^[A-Z]\w*$/.test(local)) names.add(local);
    }
  }
  return names;
}

/** True when `lines[line - 1]` opens `<tag`, or a react-native component of this file. */
export function lineOpensElement(lines: readonly string[], line: number, tag: string): boolean {
  const text = lines[line - 1] ?? '';
  if (new RegExp(`<${tag}(?![\\w-])`).test(text)) return true;
  for (const name of universalNames(lines)) {
    if (new RegExp(`<${name}(?![\\w.-])`).test(text)) return true;
  }
  return false;
}
