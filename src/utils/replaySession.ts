/**
 * REPLAY — the READ side of `itera.activity_traces`, as pure functions.
 *
 * Plan `20260803-itera-replay-de-sessao-de-atividade`, **Fase 1**. Fase 0
 * (migration 0037, `spec_snapshot` + `spec_locale`) shipped in PR #273 and is
 * the reason this file can exist at all.
 *
 * Until now nothing in `src/` READ this table — `git grep activity_traces` hit
 * only the writer. This module is the other half: it turns one stored row into
 * something a human can watch, and it is deliberately PURE (no React, no DOM,
 * no Supabase) so every rule below is unit-testable with fixed inputs, exactly
 * like `learningTrace.ts` on the write side.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 THE RULE THIS MODULE EXISTS TO ENFORCE: NULL IS "NOT CAPTURED"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `spec_snapshot` is NULLABLE and always will be: every attempt settled before
 * migration 0037 was applied has no enunciado anywhere, and no backfill can
 * invent one (0037's header says so, and the days 0036/0037/0038 sat
 * merged-and-unapplied are exactly that population).
 *
 * The tempting fallback — "no snapshot, so render `itera.activities.spec`" — is
 * the single worst thing this surface could do. That column is mutable jsonb
 * with no version and no hash, the trigger `activity_defs_sync_instances`
 * (migration 0024) rewrites it across every instance without looking at whether
 * attempts exist, and `resolveLocalizedSpec` picks the locale at RENDER time
 * from localStorage. So the fallback would show TODAY's wording in the
 * WATCHER's language and present it as what the learner read.
 *
 * A replay that diverges from what the learner saw is worse than no replay,
 * because it looks like the truth. Hence `ReplayEnunciado` is a TAGGED UNION
 * and not an optional field: a caller cannot render the enunciado without first
 * handling the case where there is none. There is no code path from here to
 * `itera.activities.spec`, and `src/test/replayAdminOnly.test.ts` asserts the
 * absence mechanically rather than trusting this comment.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE STATE FOLD LIVES HERE AND NOT IN THE ACTIVITY COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `activityFamilies.ts` states the destination: *"replay is literally re-running
 * the list"*, once the activities are `(state, action) => state`. They are not
 * yet — `SingleChoiceActivity` holds `useState` and `useActionRecorder` merely
 * OBSERVES — and the same file says, in writing, *"a seam never crossed is an
 * intention, not a fact"*.
 *
 * So this is the plan's **(B2)**: a replay-side reducer over the SAME action
 * vocabulary, 8 types, two families, pure. It converges on (B1) when Fase B of
 * sub-plan 1 turns the components into real reducers — at which point this fold
 * is deleted and replaced by theirs, and the tests written against it become the
 * characterization suite for that move.
 *
 * ⚠️ IT READS THE AUTHORED IDS, NEVER POSITIONS. `option_selected` carries
 * `{ option_id }` — *"the AUTHORED id, never the post-shuffle index"*
 * (`SingleChoiceActivity.tsx`). That is what makes the replay exact even for a
 * learner whose per-learner shuffle cannot be reproduced (an anonymous scope,
 * `learnerShuffle.ts:72-84`): the ORDER on screen may differ from what they saw,
 * the MEANING never does. Fase 2 ports `seededShuffle` to reproduce the order
 * too; this version deliberately does not, and the surface says so rather than
 * implying the layout is faithful.
 */
import type { ActivityKind } from '@iterahq/activity-spec';
import {
  ACTIVITY_FAMILY,
  FAMILY_EMITTED,
  type ActivityFamily,
} from '@/utils/activityFamilies';
import { readTrace, type StoredLearnerAction } from '@/utils/learningTrace';

/**
 * The enunciado, as a TAGGED UNION — see the module header for why this is not
 * `spec?: …`.
 *
 * `not_captured` is a first-class, expected, permanent state. It is not an
 * error and it is not a loading state: it is the honest record of an attempt
 * settled by a build that could not store what the learner read.
 */
export type ReplayEnunciado =
  | {
      status: 'captured';
      /** The spec AS RENDERED to this learner. Never re-fetched, never merged. */
      spec: Record<string, unknown>;
      /** The language the learner actually read it in. */
      locale: string;
    }
  | {
      status: 'not_captured';
      spec: null;
      locale: null;
    };

/** One attempt, ready to be watched. */
export interface ReplaySession {
  traceId: string;
  userId: string;
  activityId: string;
  /** From the joined activity row. Null when the join is unavailable. */
  kind: ActivityKind | null;
  /** ISO-8601 trace origin — the instant `at_ms: 0` refers to. */
  startedAt: string | null;
  createdAt: string | null;
  schemaVersion: number;
  /** True when the row was written by a build NEWER than this one. */
  fromFuture: boolean;
  actionsTruncated: boolean;
  /** ⚠️ NULL means "written before migration 0040", NOT `'settled'`. */
  outcome: string | null;
  actions: StoredLearnerAction[];
  enunciado: ReplayEnunciado;
}

/**
 * Read one stored row into a session, TOTALLY and TOLERANTLY.
 *
 * Delegates the envelope to `readTrace` (which already handles unknown action
 * types, unknown payload keys and a `schema_version` from the future) and adds
 * only the two things a replay needs on top: the enunciado union and the
 * activity's kind.
 *
 * Returns null only when the row carries no usable identity — no `id`, no
 * `user_id` or no `activity_id`. Everything else degrades to a poorer session
 * rather than to no session, because a sequence with a missing annotation is
 * still a sequence.
 */
export function readReplaySession(row: unknown): ReplaySession | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;

  const traceId = typeof r.id === 'string' ? r.id : '';
  const userId = typeof r.user_id === 'string' ? r.user_id : '';
  const activityId = typeof r.activity_id === 'string' ? r.activity_id : '';
  if (!traceId || !userId || !activityId) return null;

  const trace = readTrace(r);

  return {
    traceId,
    userId,
    activityId,
    kind: readKind(r),
    startedAt: trace?.started_at ?? null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
    schemaVersion: trace?.schema_version ?? 0,
    fromFuture: trace?.from_future ?? false,
    actionsTruncated: trace?.actions_truncated ?? false,
    outcome: trace?.outcome ?? null,
    actions: trace?.actions ?? [],
    enunciado: readEnunciado(r.spec_snapshot, r.spec_locale),
  };
}

/**
 * The enunciado union.
 *
 * A snapshot is only `captured` when BOTH halves are present and usable, and
 * that pairing is the same one `buildSpecSnapshot` enforces on the write side:
 * a spec whose language is unknown is ambiguous exactly where it matters, and
 * `sandbox_scenario` snapshots hold UNRESOLVED `{pt,en}` bags on purpose — a
 * reader without the locale cannot collapse them the way the learner saw them.
 *
 * An EMPTY object is `not_captured` rather than `captured`, for the reason
 * `buildSpecSnapshot` refuses to write one: `{}` would read as "this activity
 * had no enunciado", which is a claim, where NULL is an absence.
 */
function readEnunciado(snapshot: unknown, locale: unknown): ReplayEnunciado {
  const missing = { status: 'not_captured', spec: null, locale: null } as const;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return missing;
  if (Object.keys(snapshot as Record<string, unknown>).length === 0) return missing;
  if (typeof locale !== 'string' || locale === '') return missing;
  return {
    status: 'captured',
    spec: snapshot as Record<string, unknown>,
    locale,
  };
}

/** The joined activity kind, when the read supplied one. Never guessed. */
function readKind(r: Record<string, unknown>): ActivityKind | null {
  const direct = typeof r.kind === 'string' ? r.kind : null;
  const joined =
    r.activities && typeof r.activities === 'object' && !Array.isArray(r.activities)
      ? (r.activities as Record<string, unknown>).kind
      : null;
  const value = direct ?? (typeof joined === 'string' ? joined : null);
  if (!value) return null;
  return value in ACTIVITY_FAMILY ? (value as ActivityKind) : null;
}

/**
 * Does this kind's family hand a RICH sequence up, in the build that wrote this
 * row's era? Read off `FAMILY_EMITTED`, which is the single source of truth for
 * what is wired — the same map `activityTraceEmission.test.tsx` holds the
 * components to.
 *
 * The surface uses this to say ON SCREEN why a trace has only two actions,
 * instead of letting a viewer read "opened → settled" as "the learner did
 * nothing". 32% of the catalogue is wired today; presenting the other 68% as if
 * it were broken is the failure mode the plan's risk table names.
 */
export function familyEmitsSequence(kind: ActivityKind | null): boolean {
  if (!kind) return false;
  const family: ActivityFamily = ACTIVITY_FAMILY[kind];
  return FAMILY_EMITTED[family].length > 0;
}

/**
 * `id → human label`, read out of the SNAPSHOT so the timeline can say
 * *"chose «Paris»"* instead of *"chose opt_3"*.
 *
 * Covers every option-bearing shape the wired families use: `options`
 * (selection), `items` (order), `left`/`right` (match). Anything else is simply
 * absent from the index, and the caller falls back to the raw id — which is
 * still true, just less readable.
 *
 * ⚠️ Only ever fed the snapshot. When there is none the index is EMPTY and the
 * timeline shows raw ids and SAYS the labels are unavailable, because the one
 * other place those labels exist is today's spec, and today's spec is precisely
 * what this whole feature refuses to substitute.
 */
export function labelIndexFor(spec: Record<string, unknown> | null): Record<string, string> {
  const index: Record<string, string> = {};
  if (!spec) return index;
  for (const key of ['options', 'items', 'left', 'right'] as const) {
    const list = spec[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const o = entry as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : null;
      if (!id) continue;
      const label =
        (typeof o.label === 'string' && o.label) ||
        (typeof o.text === 'string' && o.text) ||
        '';
      if (label) index[id] = label;
    }
  }
  return index;
}

/**
 * The state of the activity AFTER the first `count` actions — the (B2) fold.
 *
 * Pure, total, and deliberately tolerant: an action type it has never heard of
 * advances the cursor and changes nothing, which is the read-side half of the
 * open-vocabulary rule (`StoredLearnerAction.type` is widened to `string` for
 * exactly this reason). A newer build's action must never make an older reader
 * throw.
 *
 * `selected` is an ARRAY rather than a Set so the result is structurally
 * comparable in a test with a plain literal, and it preserves CLICK ORDER —
 * which is itself signal ("they went for the distractor first").
 */
export interface ReplayState {
  /** Currently-chosen option ids, in the order they were chosen. */
  selected: string[];
  /** Current permutation (`order` kind), when one has been established. */
  order: string[];
  /** Pairs currently formed (`match` kind). */
  pairs: Array<[string, string]>;
  /** A left card awaiting its right card. */
  armed: string | null;
  /** The learner has submitted. */
  submitted: boolean;
  /** How the attempt ended, once the terminal action is in range. */
  ended: 'settled' | 'abandoned' | null;
  /** The verdict the learner was shown, once settled. */
  passed: boolean | null;
}

const EMPTY_STATE: ReplayState = {
  selected: [],
  order: [],
  pairs: [],
  armed: null,
  submitted: false,
  ended: null,
  passed: null,
};

export function replayStateAt(actions: readonly StoredLearnerAction[], count: number): ReplayState {
  const state: ReplayState = { ...EMPTY_STATE, selected: [], order: [], pairs: [] };
  const upTo = Math.max(0, Math.min(count, actions.length));

  for (let i = 0; i < upTo; i += 1) {
    const action = actions[i];
    const p = (action.payload ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

    switch (action.type) {
      case 'option_selected': {
        const id = str(p.option_id);
        if (id && !state.selected.includes(id)) state.selected.push(id);
        break;
      }
      case 'option_deselected': {
        const id = str(p.option_id);
        if (id) state.selected = state.selected.filter((s) => s !== id);
        break;
      }
      case 'item_moved': {
        // `{ item_id, from, to }` — indices into the CURRENT permutation. The
        // permutation itself is not in the payload (it would re-store the whole
        // list on every move), so it is rebuilt by applying the moves in order.
        // Until an `answer_submitted` arrives the list may be unknown, in which
        // case the move is recorded as a no-op rather than invented.
        const id = str(p.item_id);
        const to = typeof p.to === 'number' ? p.to : null;
        if (!id) break;
        if (!state.order.includes(id)) state.order.push(id);
        if (to !== null) {
          const from = state.order.indexOf(id);
          const clamped = Math.max(0, Math.min(to, state.order.length - 1));
          state.order.splice(from, 1);
          state.order.splice(clamped, 0, id);
        }
        break;
      }
      case 'pair_armed': {
        state.armed = str(p.left_id);
        break;
      }
      case 'pair_made': {
        const left = str(p.left_id);
        const right = str(p.right_id);
        state.armed = null;
        if (left && right && !state.pairs.some(([l]) => l === left)) state.pairs.push([left, right]);
        break;
      }
      case 'pair_broken': {
        const left = str(p.left_id);
        const right = str(p.right_id);
        state.pairs = state.pairs.filter(([l, r]) => !(l === left && r === right));
        break;
      }
      case 'answer_submitted': {
        state.submitted = true;
        // The submit restates the final shape, which is the one place the whole
        // permutation is authoritative — so it CORRECTS whatever the move-fold
        // reconstructed rather than being ignored.
        if (Array.isArray(p.order)) state.order = p.order.filter((v): v is string => typeof v === 'string');
        if (Array.isArray(p.option_ids)) {
          state.selected = p.option_ids.filter((v): v is string => typeof v === 'string');
        }
        if (Array.isArray(p.pairs)) {
          state.pairs = p.pairs
            .filter((v): v is [string, string] => Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string')
            .map((v) => [v[0], v[1]] as [string, string]);
        }
        break;
      }
      case 'attempt_settled': {
        state.ended = 'settled';
        state.passed = typeof p.passed === 'boolean' ? p.passed : null;
        break;
      }
      case 'attempt_abandoned': {
        state.ended = 'abandoned';
        break;
      }
      default:
        // Unknown vocabulary from a newer build, or a lifecycle action with no
        // state effect (`activity_opened`). Advance, change nothing, never throw.
        break;
    }
  }

  return state;
}

/**
 * The idle gap BEFORE each action, in ms — the cheapest signal in the whole
 * trace, and the one the plan calls out: the gap is where the learner thought,
 * hesitated, or got stuck.
 */
export function gapsBetween(actions: readonly StoredLearnerAction[]): number[] {
  return actions.map((a, i) => (i === 0 ? 0 : Math.max(0, a.at_ms - actions[i - 1].at_ms)));
}

/** `12.3s` / `1m 04s` — a millisecond offset a human can read at a glance. */
export function formatOffset(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
