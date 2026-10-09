import type { HeaderIconName } from '@/consts/headerIconPaths';

export interface SearchEntry {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  /** Extra words that match the entry without being shown. */
  keywords?: readonly string[];
  /** Shown but not navigable (a locked day). */
  disabled?: boolean;
  /** Listed when the query is empty. */
  suggested?: boolean;
  icon?: HeaderIconName | 'lock' | 'day' | 'medal';
}

/** One group of the palette; `label` is already translated. Another source = one more object of this shape. */
export interface SearchSource {
  id: string;
  label: string;
  entries: readonly SearchEntry[];
  /** Entries listed for an empty query only; a typed query never returns them. */
  suggestOnly?: boolean;
}

export interface IndexedEntry {
  entry: SearchEntry;
  sourceId: string;
  order: number;
  title: string;
  subtitle: string;
  keywords: string;
  suggestOnly: boolean;
}

export interface SearchIndex {
  sources: readonly { id: string; label: string }[];
  items: readonly IndexedEntry[];
}

export interface SearchGroup {
  id: string;
  label: string;
  entries: readonly SearchEntry[];
}
