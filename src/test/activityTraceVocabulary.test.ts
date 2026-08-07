/**
 * The extracted kinds emit action names the Player's taxonomy still recognises.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES
 * ─────────────────────────────────────────────────────────────────────────────
 * `src/utils/activityFamilies.ts` owns the action vocabulary and narrows it at
 * the TYPE level: a `selection` activity cannot record `pair_made`, because it
 * does not compile. Fase C moved four of the kinds that do the recording into
 * `@iterahq/activities`, and the package deliberately does NOT carry that
 * taxonomy — it is Itera's telemetry model, and a library that shipped it would
 * hand every consumer Itera's event vocabulary along with the renderers.
 *
 * The cost of that decision is precise: inside the package the recorder is
 * generic over a plain string union, so the compiler no longer connects the two
 * sides. Rename `option_selected` on either side and everything still builds —
 * the Player would simply start writing an action name its own replay cannot
 * interpret, into a table whose history cannot be re-collected. Exactly the
 * class of loss `20260731-itera-eventos-aprendizagem` exists to prevent.
 *
 * So the connection that the type system used to make is made here instead.
 * SUBSET, not equality: the package need not emit everything a family declares
 * (`FAMILY_ACTIONS` is what a family ACCEPTS; `FAMILY_EMITTED` is the smaller
 * set this build writes), but it must never emit something outside it.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVITY_TRACE_ACTIONS, MAX_ACTIVITY_ACTIONS } from '@iterahq/activities';
import { FAMILY_ACTIONS } from '@/utils/activityFamilies';
import { MAX_TRACE_ACTIONS } from '@/utils/learningTrace';

describe('extracted kinds vs. the Player action taxonomy', () => {
  it.each(Object.keys(ACTIVITY_TRACE_ACTIONS) as (keyof typeof ACTIVITY_TRACE_ACTIONS)[])(
    'every %s action the package emits is declared by the family',
    (family) => {
      const declared = new Set<string>(FAMILY_ACTIONS[family] as readonly string[]);
      const emitted = ACTIVITY_TRACE_ACTIONS[family] as readonly string[];
      expect(emitted.filter((a) => !declared.has(a))).toEqual([]);
    },
  );

  it('names a family the app actually has', () => {
    for (const family of Object.keys(ACTIVITY_TRACE_ACTIONS)) {
      expect(Object.keys(FAMILY_ACTIONS)).toContain(family);
    }
  });

  it('caps the buffer at the same size the trace builder assumes', () => {
    // The Player truncates at `MAX_TRACE_ACTIONS` and flags `actionsTruncated`.
    // If the package cut earlier, the Player would record a complete-looking
    // trace that had silently lost its tail; if later, the buffer would grow
    // past what the writer expects.
    expect(MAX_ACTIVITY_ACTIONS).toBe(MAX_TRACE_ACTIONS);
  });
});
