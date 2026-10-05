/**
 * teraMention — does this activity talk about Tera, the mascot?
 *
 * The rule the authoring MCP documents: an activity shows Tera when any of its
 * learner-visible prose fields contains the whole word `Tera` with a capital
 * T. "Itera", "tera", "Terabyte", and anything inside inline code, a fenced
 * block or a URL (`tera.site`) do not count.
 *
 * Prose fields are the ones a learner reads as text, wherever they sit in the
 * spec: `text`, `description`, `prompt`, `question`, `title`, `body`, `label`,
 * `answer`, `explanation`, `recap`, `caption`, `reaction`, `stamp`, `note`,
 * `job`, `hint` and every `*_hint`. Code, URLs, ids, names, placeholders and
 * media never count.
 */
export const TERA_WORD = /(?<![\p{L}\p{N}_])Tera(?![\p{L}\p{N}_])/u;

const PROSE_KEY =
  /^(text|description|prompt|question|title|body|label|answer|explanation|recap|caption|reaction|stamp|note|job|hint|[a-z_]*_hint)$/;

const FENCED = /```[\s\S]*?(```|$)/g;
const INLINE_CODE = /`[^`\n]*`/g;
const URL = /\S*:\/\/\S*|\S+\.[a-z]{2,}(\/\S*)?/g;
const MEDIA = /!\[[^\]]*\]\([^)]*\)/g;

/** The prose of a text, with code and links taken out. */
export function proseOf(text: string): string {
  return text.replace(FENCED, ' ').replace(MEDIA, ' ').replace(INLINE_CODE, ' ').replace(URL, ' ');
}

export function textMentionsTera(text: string): boolean {
  return TERA_WORD.test(proseOf(text));
}

export function mentionsTera(spec: unknown): boolean {
  return walk(spec, null);
}

function walk(value: unknown, key: string | null): boolean {
  if (typeof value === 'string') return key !== null && PROSE_KEY.test(key) && textMentionsTera(value);
  if (Array.isArray(value)) return value.some((item) => walk(item, key));
  if (value && typeof value === 'object') {
    // A localized bag keeps its parent's key: `{ prompt: { pt, en } }` is still prose.
    return Object.entries(value).some(([k, v]) =>
      walk(v, k === 'pt' || k === 'en' ? key : k),
    );
  }
  return false;
}
