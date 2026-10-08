import type { CatalogListState } from './catalog';

/** The glyphs of the dashboard. React Native draws no SVG: the host answers each with its own node, or with none. */
export type HomeIcon =
  | { readonly kind: 'hero' | 'crown' | 'streak' | 'xp' | 'badges' | 'completed' | 'browse' | 'badge-check' }
  /** The glyph of one medal: `index` is its position in the grid. */
  | { readonly kind: 'badge'; readonly earned: boolean; readonly index: number };

/** The welcome panel, as the learner reads it. A count that is still loading is a dash. */
export interface HomeStatsView {
  readonly name: string;
  readonly initials: string;
  readonly streak: string;
  readonly xp: string;
  readonly badges: string;
  readonly completed: string;
}

export interface HomeBadgeView {
  readonly id: string;
  readonly title: string;
  readonly earned: boolean;
}

export type HomeBadgesState = { readonly kind: 'loading' } | { readonly kind: 'empty' } | { readonly kind: 'ready'; readonly badges: readonly HomeBadgeView[] };

/**
 * What the dashboard shows. A member: the welcome panel, the enrolled programs (cards with the `enrolled`
 * foot) and the medals. A visitor (no active subscription; the web only): the catalog, locked, under the
 * host's own hint; the host draws its offer in the screen's `aside` slot.
 */
export type HomeView =
  | { readonly kind: 'member'; readonly stats: HomeStatsView; readonly programs: CatalogListState; readonly badges: HomeBadgesState }
  | { readonly kind: 'visitor'; readonly programs: CatalogListState; readonly hint: string | undefined };
