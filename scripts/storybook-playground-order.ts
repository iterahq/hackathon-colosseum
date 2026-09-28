/**
 * storybook-playground-order.ts — "send order" for the Design Playground
 * sidebar section (`design-playground/**` +, in a PR build, the generated
 * `.storybook/generated/**` re-exports — see `generate-nesta-pr-stories.ts`).
 *
 * "Send order" = the date the story FILE was added
 * (`git log --diff-filter=A --format=%cI -1 -- <file>`), most recent first,
 * tie-broken by the file's last-modified date. Everything else in the tree
 * (`src/**`, `packages/**`) keeps its current alphabetical-by-title order —
 * this module only ever touches the Design Playground group.
 *
 * WHY A TAG, NOT A DIRECT COMPARISON IN `storySort`: Storybook extracts the
 * `parameters.options.storySort` value from `.storybook/preview.tsx`'s
 * SOURCE TEXT via a Babel AST walk (`getStorySortParameter`, in
 * `storybook/internal/csf-tools`) and, for the function form, re-`eval`s
 * just that function's own source in an isolated scope — no import, no
 * closure over anything else in the file survives (see the comment on
 * `storySort` in `preview.tsx`). So the ordering DATA cannot be imported
 * into that function; it has to already be sitting on the two objects the
 * comparator receives (`a`, `b` — real Storybook index entries, which DO
 * carry `tags`). This module computes a numeric score and encodes it as a
 * tag (`playground-order:<score>`) on each story's index entry — added by
 * `storybook-playground-indexer.ts`, a custom `experimental_indexers` entry
 * that runs in Node with full `git`/`fs` access, no eval-isolation limits.
 * `preview.tsx`'s comparator then reads that tag back with its own
 * self-contained regex — this file's `ORDER_TAG_PREFIX` and
 * `parseOrderTag`/`buildOrderTag` are the single source of truth for the
 * tag's shape, but the comparator in `preview.tsx` necessarily duplicates
 * the tiny parsing logic verbatim (see the comment there for why).
 *
 * Score encoding: `addedAtEpochSeconds` as the integer part (so two files
 * added on different days always compare correctly), with
 * `modifiedAtEpochSeconds` folded into a fractional tie-break that only
 * matters when two files share the exact same added second (same commit).
 */

export const ORDER_TAG_PREFIX = 'playground-order:';

/** Wide enough that a fractional tie-break (added seconds since epoch, up
 *  to ~10 digits through year 2286) never collides with the integer part. */
const TIE_BREAK_DIVISOR = 1e11;

export interface SendOrderDates {
  /** ISO 8601 commit date (`%cI`) of the commit that ADDED the file, or
   *  `undefined` when git has no record of it (untracked / not yet
   *  committed — e.g. a freshly generated PR re-export). */
  addedAt: string | undefined;
  /** ISO 8601 commit date (`%cI`) of the most recent commit that touched
   *  the file, or `undefined` for the same reason. */
  modifiedAt: string | undefined;
}

/**
 * Turns `{ addedAt, modifiedAt }` into a single sortable number — bigger is
 * more recent, so descending numeric order is "most recently sent first".
 * A file git has no record of (both fields `undefined`) sorts as `0`, i.e.
 * LAST among real dated files — that only happens for a file that isn't
 * findable in history at all, which "send order" has nothing to say about.
 */
export function computeSendOrderScore(dates: SendOrderDates): number {
  const addedSeconds = dates.addedAt ? Math.floor(new Date(dates.addedAt).getTime() / 1000) : 0;
  const modifiedSeconds = dates.modifiedAt
    ? Math.floor(new Date(dates.modifiedAt).getTime() / 1000)
    : 0;
  if (addedSeconds === 0) return 0;
  return addedSeconds + modifiedSeconds / TIE_BREAK_DIVISOR;
}

/**
 * Sentinel score for a PR-generated re-export (`generate-nesta-pr-stories.ts`)
 * — those files never have git history of their own (gitignored, written
 * fresh every build), and the spec requires them at the TOP of Design
 * Playground regardless of any real file's send date. `index` breaks ties
 * between several generated entries in the priority order they were
 * generated in (0 = generated first = highest score = shown first).
 */
export function generatedPrEntryScore(index: number): number {
  return Number.MAX_SAFE_INTEGER - index;
}

export function buildOrderTag(score: number): string {
  return `${ORDER_TAG_PREFIX}${score}`;
}

/** Inverse of `buildOrderTag` — used only by this module's own tests; the
 *  real consumer (`preview.tsx`'s `storySort`) re-implements this parsing
 *  inline because it cannot import this function (see module docblock). */
export function parseOrderTag(tags: string[] | undefined): number | undefined {
  const tag = (tags ?? []).find((t) => t.startsWith(ORDER_TAG_PREFIX));
  if (!tag) return undefined;
  const value = Number(tag.slice(ORDER_TAG_PREFIX.length));
  return Number.isFinite(value) ? value : undefined;
}
