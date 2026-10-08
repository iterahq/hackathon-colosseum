import type { NavigationIntent } from './navigation';

/** The three-stop colour ramp of a category (accent: title and tile, surface: band fill, edge: band border). */
export interface CatalogCardTone {
  readonly accent: string;
  readonly surface: string;
  readonly edge: string;
}

/** The glyphs a card draws. React Native draws no SVG: the host answers each with its own node, or with none. */
export type CatalogIcon =
  | { readonly kind: 'category'; readonly icon: string | undefined }
  | { readonly kind: 'lessons' | 'units' | 'activities' | 'lock-badge' | 'open' | 'next' | 'lock-cta' };

/** What the foot of a card offers. A host with no way to enroll or to sell leaves the matching part out. */
export type CatalogCardAction =
  /** A member who is not in the course yet. */
  | { readonly kind: 'enroll'; readonly pending: boolean; readonly failed: boolean }
  /** A member who is already in: the band opens the course too. */
  | { readonly kind: 'open' }
  /** The dashboard's card of a course the learner is in: Start, or Continue under the progress line once `percent` is above 0. */
  | { readonly kind: 'enrolled'; readonly percent: number; readonly progress: string }
  /** A visitor: no enrol button ever. `subscribe` is the host's own offer, label included; absent where the host sells nothing (the shell). */
  | { readonly kind: 'locked'; readonly subscribe?: { readonly label: string; readonly link: NavigationIntent } };

/** One course, already shaped for display: the screen formats and computes nothing. */
export interface CatalogCardView {
  readonly id: string;
  readonly slug: string;
  readonly headline: string;
  readonly subline: string | null;
  /** Counts as the learner reads them ("12 lições"). */
  readonly counts: { readonly lessons: string; readonly units: string; readonly activities: string };
  readonly icon: string | undefined;
  readonly tone: CatalogCardTone;
  readonly action: CatalogCardAction;
}

/** What the list shows. `unreachable`: the first read could not reach the server (same screen, the host keeps the difference). */
export type CatalogListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly unreachable: boolean }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly programs: readonly CatalogCardView[] };
