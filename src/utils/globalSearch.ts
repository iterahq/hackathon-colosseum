import type { IndexedEntry, SearchGroup, SearchIndex, SearchSource } from '@/types/headerSearch';

const PER_GROUP = 6;

/** Lowercase, accent-free, single-spaced: the form both the index and the query are compared in. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Flatten the sources into one searchable list; source order and entry order decide ties. */
export function buildIndex(sources: readonly SearchSource[]): SearchIndex {
  const items: IndexedEntry[] = [];
  let order = 0;
  for (const source of sources) {
    for (const entry of source.entries) {
      items.push({
        entry,
        sourceId: source.id,
        order: order++,
        title: normalize(entry.title),
        subtitle: normalize(entry.subtitle ?? ''),
        keywords: normalize((entry.keywords ?? []).join(' ')),
        suggestOnly: Boolean(source.suggestOnly),
      });
    }
  }
  return { sources: sources.map(({ id, label }) => ({ id, label })), items };
}

/** 0 prefix, 1 word start, 2 substring, null no match. */
function rank(field: string, token: string): number | null {
  if (!field) return null;
  if (field.startsWith(token)) return 0;
  if (field.includes(` ${token}`)) return 1;
  return field.includes(token) ? 2 : null;
}

function scoreOf(item: IndexedEntry, token: string): number | null {
  const title = rank(item.title, token);
  if (title !== null) return title;
  const others = [rank(item.subtitle, token), rank(item.keywords, token)].filter((r): r is number => r !== null);
  return others.length > 0 ? 3 + Math.min(...others) : null;
}

function group(index: SearchIndex, picked: readonly IndexedEntry[], limit: number): SearchGroup[] {
  const out: SearchGroup[] = [];
  for (const source of index.sources) {
    const entries = picked.filter((p) => p.sourceId === source.id).slice(0, limit).map((p) => p.entry);
    if (entries.length > 0) out.push({ id: source.id, label: source.label, entries });
  }
  return out;
}

/** Entries matching every word of the query, best first inside each source group; an empty query lists the suggested ones. */
export function search(index: SearchIndex, query: string, limit = PER_GROUP): SearchGroup[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return group(index, index.items.filter((i) => i.entry.suggested), limit);

  const scored: { item: IndexedEntry; score: number }[] = [];
  for (const item of index.items) {
    if (item.suggestOnly) continue;
    let total = 0;
    let all = true;
    for (const token of tokens) {
      const s = scoreOf(item, token);
      if (s === null) {
        all = false;
        break;
      }
      total += s;
    }
    if (all) scored.push({ item, score: total });
  }
  scored.sort((a, b) => a.score - b.score || a.item.order - b.item.order);
  return group(index, scored.map((s) => s.item), limit);
}

/** Entries in the order the palette draws them, for arrow-key movement. */
export const flatten = (groups: readonly SearchGroup[]) => groups.flatMap((g) => g.entries);
