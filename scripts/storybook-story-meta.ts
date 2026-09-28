/**
 * storybook-story-meta.ts — cheap, regex-based extraction of what a CSF
 * story FILE declares: its `title` (and optional explicit `id`) from the
 * default-export meta object, and its named story exports. Good enough to
 * build links and `<Canvas of=…>` references without loading the file
 * through the real Storybook indexer (which needs a running build).
 *
 * Deliberately narrow: it only understands the CSF3 shapes this repo uses —
 * `export default { title: '...' }` AND `const meta = { title: '...' };
 * export default meta;` (both appear across `src/stories/`). It finds the
 * object literal by locating the first `title:` in the file and then
 * brace-matching outward from there, so it works regardless of how the
 * object got assigned to `export default`. `.stories.mdx` files are out of
 * scope — the caller falls back to a plain link for those.
 */

const TITLE_KEY_RE = /\btitle\s*:\s*['"]/;
const TITLE_VALUE_RE = /\btitle\s*:\s*['"]([^'"]+)['"]/;
const ID_VALUE_RE = /\bid\s*:\s*['"]([^'"]+)['"]/;
/** `component: Foo` — only the bare-identifier shape CSF meta objects in this
 *  repo use; a computed/member expression value is out of scope. */
const COMPONENT_VALUE_RE = /\bcomponent\s*:\s*([A-Za-z_$][\w$]*)/;
const EXPORT_CONST_RE = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*[:=]/gm;

export interface StoryFileMeta {
  title: string | undefined;
  /** Explicit `id:` on the meta object, if the author set one. */
  explicitId: string | undefined;
  /** The bare identifier bound to `component:` on the meta object, e.g.
   *  `ActivityRenderer` — the caller resolves it back to an import
   *  specifier to find the story's own component file. */
  componentIdentifier: string | undefined;
  exportNames: string[];
}

/**
 * Brace-matches outward from `index` to find the smallest `{ ... }` object
 * literal containing it. Not a real parser (a `{`/`}` inside a string or
 * template literal would confuse it), but CSF meta objects in this repo
 * don't nest braced strings around `title`/`id`, so it holds in practice.
 */
function findEnclosingObjectLiteral(source: string, index: number): string | undefined {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i--) {
    const ch = source[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return undefined;

  let openCount = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') openCount++;
    else if (ch === '}') {
      openCount--;
      if (openCount === 0) return source.slice(start, i + 1);
    }
  }
  return undefined;
}

export function parseStoryFileMeta(source: string): StoryFileMeta {
  const titleKeyMatch = TITLE_KEY_RE.exec(source);
  let title: string | undefined;
  let explicitId: string | undefined;
  let componentIdentifier: string | undefined;

  if (titleKeyMatch) {
    const block = findEnclosingObjectLiteral(source, titleKeyMatch.index) ?? source;
    title = TITLE_VALUE_RE.exec(block)?.[1];
    explicitId = ID_VALUE_RE.exec(block)?.[1];
    componentIdentifier = COMPONENT_VALUE_RE.exec(block)?.[1];
  }

  const exportNames: string[] = [];
  for (const match of source.matchAll(EXPORT_CONST_RE)) {
    exportNames.push(match[1]);
  }

  return { title, explicitId, componentIdentifier, exportNames };
}
